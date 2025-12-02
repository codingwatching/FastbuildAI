import { BaseService } from "@buildingai/base";
import { PayConfigPayType, PayConfigType } from "@buildingai/constants";
import { type UserTerminalType } from "@buildingai/constants/shared/status-codes.constant";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { MembershipLevels, MembershipOrder, MembershipPlans } from "@buildingai/db/entities";
import { Payconfig } from "@buildingai/db/entities";
import { RefundLog } from "@buildingai/db/entities";
import { UserSubscription } from "@buildingai/db/entities";
import { DictService } from "@buildingai/dict";
import { HttpErrorFactory } from "@buildingai/errors";
import { generateNo } from "@buildingai/utils";
import { REFUND_ORDER_FROM } from "@common/modules/refund/constants/refund.constants";
import { RefundService } from "@common/modules/refund/services/refund.service";
import { Injectable } from "@nestjs/common";
import { Repository } from "typeorm";

import { QueryMembershipOrderDto } from "../dto/query-membership-order.dto";

@Injectable()
export class MembershipOrderService extends BaseService<MembershipOrder> {
    constructor(
        @InjectRepository(MembershipOrder)
        private readonly membershipOrderRepository: Repository<MembershipOrder>,
        @InjectRepository(Payconfig)
        private readonly payconfigRepository: Repository<Payconfig>,
        @InjectRepository(RefundLog)
        private readonly refundLogRepository: Repository<RefundLog>,
        @InjectRepository(UserSubscription)
        private readonly userSubscriptionRepository: Repository<UserSubscription>,
        @InjectRepository(MembershipPlans)
        private readonly membershipPlansRepository: Repository<MembershipPlans>,
        @InjectRepository(MembershipLevels)
        private readonly membershipLevelsRepository: Repository<MembershipLevels>,
        private readonly refundService: RefundService,
        private readonly dictService: DictService,
    ) {
        super(membershipOrderRepository);
    }

    /**
     * 会员订单列表
     * @param queryMembershipOrderDto
     * @returns
     */
    async lists(queryMembershipOrderDto: QueryMembershipOrderDto) {
        const { orderNo, userKeyword, startTime, endTime, payType, payState, refundState } =
            queryMembershipOrderDto;
        const queryBuilder = this.membershipOrderRepository.createQueryBuilder("membership-order");
        queryBuilder.leftJoin("membership-order.user", "user");
        if (orderNo) {
            queryBuilder.andWhere("membership-order.orderNo ILIKE :orderNo", {
                orderNo: `%${orderNo}%`,
            });
        }
        if (userKeyword) {
            queryBuilder.andWhere(
                "(user.username ILIKE :userKeyword OR user.phone ILIKE :userKeyword)",
                {
                    userKeyword: `%${userKeyword}%`,
                },
            );
        }
        if (startTime) {
            queryBuilder.andWhere("membership-order.createdAt >= :startTime", {
                startTime,
            });
        }
        if (endTime) {
            queryBuilder.andWhere("membership-order.createdAt <= :endTime", {
                endTime,
            });
        }
        if (payType) {
            queryBuilder.andWhere("membership-order.payType = :payType", {
                payType,
            });
        }
        if (payState) {
            queryBuilder.andWhere("membership-order.payState = :payState", {
                payState,
            });
        }
        if (refundState) {
            queryBuilder.andWhere("membership-order.refundStatus = :refundState", {
                refundState,
            });
        }
        queryBuilder.select([
            "membership-order.id",
            "membership-order.orderNo",
            "membership-order.payType",
            "membership-order.payState",
            "membership-order.refundStatus",
            "membership-order.planSnap",
            "membership-order.levelSnap",
            "membership-order.totalAmount",
            "membership-order.duration",
            "membership-order.payTime",
            "membership-order.createdAt",
            "membership-order.orderAmount",
            "user.username",
            "user.avatar",
        ]);
        const payWayList = await this.payconfigRepository.find({
            select: ["name", "payType"],
        });
        queryBuilder.orderBy("membership-order.createdAt", "DESC");
        const orderLists = await this.paginateQueryBuilder(queryBuilder, queryMembershipOrderDto);
        orderLists.items = orderLists.items.map((order) => {
            const payTypeDesc = payWayList.find((item) => item.payType == order.payType)?.name;
            const payStateDesc = order.payState == 1 ? "已支付" : "未支付";
            const refundStateDesc = order.refundStatus == 1 ? "已退款" : "未退款";
            return { ...order, payTypeDesc, payStateDesc, refundStateDesc };
        });
        const totalOrder = await this.membershipOrderRepository.count({
            where: { payState: 1 },
        });
        const totalAmount =
            (await this.membershipOrderRepository.sum("orderAmount", {
                payState: 1,
            })) || 0;
        const totalRefundOrder = await this.membershipOrderRepository.count({
            where: { refundStatus: 1 },
        });
        const totalRefundAmount =
            (await this.membershipOrderRepository.sum("orderAmount", {
                refundStatus: 1,
            })) || 0;
        const totalIncome = totalAmount - totalRefundAmount;
        const statistics = {
            totalOrder,
            totalAmount,
            totalRefundOrder,
            totalRefundAmount,
            totalIncome,
        };
        return {
            ...orderLists,
            extend: {
                statistics,
                payTypeLists: payWayList,
            },
        };
    }

    /**
     * 会员订单详情
     * @param id
     * @returns
     */
    async detail(id: string) {
        const queryBuilder = this.membershipOrderRepository.createQueryBuilder("membership-order");
        queryBuilder.leftJoin("membership-order.user", "user");
        queryBuilder.where("membership-order.id = :id", { id });
        queryBuilder.select([
            "membership-order.id",
            "membership-order.orderNo",
            "membership-order.payType",
            "membership-order.payState",
            "membership-order.refundStatus",
            "membership-order.planSnap",
            "membership-order.levelSnap",
            "membership-order.totalAmount",
            "membership-order.duration",
            "membership-order.payTime",
            "membership-order.createdAt",
            "membership-order.orderAmount",
            "user.username",
            "user.avatar",
        ]);
        const detail = await queryBuilder.getOne();
        if (!detail) {
            throw HttpErrorFactory.badRequest("会员订单不存在");
        }
        let refundStatusDesc = "-";
        if (detail.refundStatus) {
            refundStatusDesc = "已退款";
        }
        const orderType = "会员订单";
        const payTypeDesc = await this.payconfigRepository.findOne({
            select: ["name"],
            where: {
                payType: detail.payType,
            },
        });
        let refundNo = "";
        if (detail.refundStatus) {
            refundNo = (
                await this.refundLogRepository.findOne({
                    where: { orderId: detail.id },
                })
            )?.refundNo;
        }
        const terminalDesc = "电脑PC";
        return {
            ...detail,
            orderType,
            refundStatusDesc,
            terminalDesc,
            refundNo,
            payTypeDesc: payTypeDesc.name,
        };
    }

    /**
     * 会员订单退款
     * @param id
     */
    async refund(id: string) {
        try {
            const order = await this.membershipOrderRepository.findOne({
                where: { id },
            });
            if (!order) {
                throw new Error("会员订单不存在");
            }
            if (0 == order.payState) {
                throw new Error("订单未支付,不能发起退款");
            }
            if (order.refundStatus) {
                throw new Error("订单已退款");
            }
            await this.membershipOrderRepository.manager.transaction(async (entityManager) => {
                // 发起退款
                await this.refundService.initiateRefund({
                    entityManager,
                    orderId: order.id,
                    userId: order.userId,
                    orderNo: order.orderNo,
                    from: REFUND_ORDER_FROM.FROM_MEMBERSHIP,
                    payType: order.payType,
                    transactionId: order.transactionId,
                    orderAmount: order.orderAmount,
                    refundAmount: order.orderAmount,
                });
                // 更新退款状态
                await entityManager.update(MembershipOrder, id, {
                    refundStatus: 1,
                });
                // 删除用户订阅记录
                await entityManager.delete(UserSubscription, {
                    orderId: order.id,
                });
            });
        } catch (error) {
            throw HttpErrorFactory.badRequest(error.message);
        }
    }

    /**
     * 提交会员订单
     * @param planId 套餐ID
     * @param levelId 等级ID
     * @param payType 支付类型
     * @param userId 用户ID
     * @param terminal 终端类型
     * @returns 订单信息
     */
    async submitOrder(
        planId: string,
        levelId: string,
        payType: PayConfigType,
        userId: string,
        terminal: UserTerminalType,
    ) {
        try {
            // 检查会员功能状态
            const membershipStatus = await this.dictService.get(
                "membership_plans_status",
                false,
                "membership_config",
            );
            if (false === membershipStatus) {
                throw HttpErrorFactory.badRequest("会员功能已关闭");
            }

            // 验证支付方式
            if (PayConfigPayType.WECHAT !== payType) {
                throw HttpErrorFactory.badRequest("支付方式错误");
            }

            // 查询套餐信息
            const plan = await this.membershipPlansRepository.findOne({
                where: { id: planId, status: true },
            });
            if (!plan) {
                throw HttpErrorFactory.badRequest("会员套餐不存在或已下架");
            }

            // 查询等级信息
            const level = await this.membershipLevelsRepository.findOne({
                where: { id: levelId, status: true },
            });
            if (!level) {
                throw HttpErrorFactory.badRequest("会员等级不存在或已下架");
            }

            // 从套餐的 billing 中找到对应等级的价格信息
            const billingItem = plan.billing?.find((item) => item.levelId === levelId);
            if (!billingItem || !billingItem.status) {
                throw HttpErrorFactory.badRequest("该等级在此套餐中不可用");
            }

            // 格式化会员时长
            let durationText = "";
            if (plan.duration?.value && plan.duration?.unit) {
                durationText = `${plan.duration.value}${plan.duration.unit}`;
            } else {
                // 根据 durationConfig 生成默认文本
                const durationMap = {
                    1: "1个月",
                    2: "3个月",
                    3: "6个月",
                    4: "12个月",
                    5: "终身",
                    6: "自定义",
                };
                durationText = durationMap[plan.durationConfig] || "未知";
            }

            // 生成订单号
            const orderNo = await generateNo(this.membershipOrderRepository, "orderNo");

            // 创建订单快照(移除不必要的属性,避免循环引用)
            // 使用 JSON 序列化确保数据格式正确
            const planSnap = JSON.parse(
                JSON.stringify({
                    id: plan.id,
                    name: plan.name,
                    label: plan.label,
                    durationConfig: plan.durationConfig,
                    duration: plan.duration,
                    billing: plan.billing,
                    levelCount: plan.billing?.length ?? 0,
                    status: plan.status,
                    sort: plan.sort,
                }),
            );

            const levelSnap = JSON.parse(
                JSON.stringify({
                    id: level.id,
                    name: level.name,
                    level: level.level,
                    givePower: level.givePower,
                    status: level.status,
                    icon: level.icon,
                    description: level.description,
                    benefits: level.benefits,
                }),
            );

            // 创建订单
            const membershipOrder = await this.membershipOrderRepository.save({
                userId,
                terminal,
                orderNo,
                planId: plan.id,
                levelId: level.id,
                planSnap,
                levelSnap,
                payType,
                duration: durationText,
                totalAmount: billingItem.originalPrice,
                orderAmount: billingItem.salesPrice,
            });

            return {
                orderId: membershipOrder.id,
                orderNo,
                orderAmount: membershipOrder.orderAmount,
            };
        } catch (error) {
            throw HttpErrorFactory.badRequest(error.message || "提交订单失败");
        }
    }
}
