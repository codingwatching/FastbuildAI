import {
    ACCOUNT_LOG_SOURCE,
    ACCOUNT_LOG_TYPE,
} from "@buildingai/constants/shared/account-log.constants";
import { Cron } from "@buildingai/core/@nestjs/schedule";
import { AppBillingService } from "@buildingai/core/modules";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { AccountLog, User, UserSubscription } from "@buildingai/db/entities";
import { Injectable, Logger } from "@nestjs/common";
import { LessThanOrEqual, MoreThan, MoreThanOrEqual, Repository } from "typeorm";

/**
 * 会员积分赠送定时任务服务
 *
 * 积分发放和清零逻辑:
 * - 用户购买会员后立即赠送积分,过期时间为下月同日
 * - 每天检查当天需要清零的过期积分
 * - 每天检查当天需要发放新积分的订阅(基于订阅开始日期的日号)
 */
@Injectable()
export class MembershipGiftService {
    private readonly logger = new Logger(MembershipGiftService.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(UserSubscription)
        private readonly userSubscriptionRepository: Repository<UserSubscription>,
        @InjectRepository(AccountLog)
        private readonly accountLogRepository: Repository<AccountLog>,
        private readonly appBillingService: AppBillingService,
    ) {}

    /**
     * 每天凌晨0点执行:清零过期的会员赠送积分
     */
    @Cron("0 0 * * *", {
        name: "daily-expired-gift-power-cleanup",
        timeZone: "Asia/Shanghai",
    })
    async handleExpiredGiftPowerCleanup() {
        this.logger.log("开始执行过期会员赠送积分清零任务");

        try {
            const now = new Date();

            // 查询所有已过期且还有剩余可用数量的会员赠送积分记录
            const expiredLogs = await this.accountLogRepository.find({
                where: {
                    expireAt: LessThanOrEqual(now),
                    availableAmount: MoreThan(0),
                } as any,
            });

            this.logger.log(`找到 ${expiredLogs.length} 条过期的会员赠送积分记录`);

            for (const log of expiredLogs) {
                try {
                    await this.processExpiredGiftPower(log);
                } catch (error) {
                    this.logger.error(`处理过期积分记录 ${log.id} 失败: ${error.message}`);
                }
            }

            this.logger.log("过期会员赠送积分清零任务执行完成");
        } catch (error) {
            this.logger.error(`过期积分清零任务执行失败: ${error.message}`);
        }
    }

    /**
     * 处理单条过期的会员赠送积分记录
     * @param log 过期的积分记录
     */
    private async processExpiredGiftPower(log: AccountLog) {
        const expiredAmount = (log as any).availableAmount;

        if (expiredAmount <= 0) {
            return;
        }

        await this.userRepository.manager.transaction(async (entityManager) => {
            // 1. 将过期积分记录的可用数量清零
            await entityManager.update(AccountLog, { id: log.id }, { availableAmount: 0 } as any);

            // 2. 从用户总积分中扣除过期的积分
            await entityManager.decrement(User, { id: log.userId }, "power", expiredAmount);

            this.logger.log(`用户 ${log.userId} 过期积分 ${expiredAmount} 已清零`);
        });
    }

    /**
     * 每天凌晨0点5分执行:为当天需要发放积分的会员发放新积分
     * 发放条件:订阅开始日期的日号 == 今天的日号,且订阅仍在有效期内
     */
    @Cron("5 0 * * *", {
        name: "daily-gift-power-grant",
        timeZone: "Asia/Shanghai",
    })
    async handleDailyGiftPowerGrant() {
        this.logger.log("开始执行每日会员积分发放任务");

        try {
            const now = new Date();
            const todayDay = now.getDate(); // 今天是几号

            // 查询所有有效的会员订阅
            const activeSubscriptions = await this.userSubscriptionRepository.find({
                where: {
                    startTime: LessThanOrEqual(now),
                    endTime: MoreThanOrEqual(now),
                },
                relations: ["level"],
            });

            // 筛选出今天需要发放积分的订阅(订阅开始日期的日号 == 今天的日号)
            const subscriptionsToGrant = activeSubscriptions.filter((sub) => {
                const startDay = sub.startTime.getDate();
                // 处理月末情况:如果订阅开始日期是31号,但本月只有30天,则在30号发放
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                const effectiveStartDay = Math.min(startDay, daysInMonth);
                return effectiveStartDay === todayDay;
            });

            this.logger.log(`找到 ${subscriptionsToGrant.length} 个今日需要发放积分的会员订阅`);

            for (const subscription of subscriptionsToGrant) {
                try {
                    await this.processUserGiftPower(subscription);
                } catch (error) {
                    this.logger.error(
                        `处理用户 ${subscription.userId} 的积分发放失败: ${error.message}`,
                    );
                }
            }

            this.logger.log("每日会员积分发放任务执行完成");
        } catch (error) {
            this.logger.error(`每日会员积分任务执行失败: ${error.message}`);
        }
    }

    /**
     * 处理单个用户的积分赠送
     * @param subscription 用户订阅记录
     */
    private async processUserGiftPower(subscription: UserSubscription) {
        const givePower = (subscription.level as any)?.givePower || 0;

        if (givePower <= 0) {
            return;
        }

        // 计算下月同日作为过期时间
        const now = new Date();
        const expireAt = this.getNextMonthSameDay(now);

        // 发放新的临时积分(带过期时间)
        await this.appBillingService.addUserPower({
            amount: givePower,
            accountType: ACCOUNT_LOG_TYPE.MEMBERSHIP_GIFT_INC,
            userId: subscription.userId,
            source: {
                type: ACCOUNT_LOG_SOURCE.MEMBERSHIP_GIFT,
                source: "会员月度赠送",
            },
            remark: `会员月度赠送临时积分：${givePower}`,
            associationNo: subscription.orderId || "",
            expireAt,
        });

        this.logger.log(
            `用户 ${subscription.userId} 积分发放完成,赠送 ${givePower} 积分,过期时间 ${expireAt.toISOString()}`,
        );
    }

    /**
     * 获取下月同日的时间
     * 如果下月没有该日期(如1月31日->2月),则取下月最后一天
     * @param date 日期
     * @returns 下月同日的0点时间
     */
    private getNextMonthSameDay(date: Date): Date {
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();

        // 计算下月
        const nextMonth = month + 1;
        const nextYear = nextMonth > 11 ? year + 1 : year;
        const actualNextMonth = nextMonth > 11 ? 0 : nextMonth;

        // 获取下月的天数
        const daysInNextMonth = new Date(nextYear, actualNextMonth + 1, 0).getDate();

        // 如果下月没有该日期,取下月最后一天
        const actualDay = Math.min(day, daysInNextMonth);

        const nextDate = new Date(nextYear, actualNextMonth, actualDay);
        nextDate.setHours(0, 0, 0, 0);
        return nextDate;
    }
}
