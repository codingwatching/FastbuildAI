import { DataSource } from "../../typeorm";
import { MembershipLevels } from "./../../entities/membership-levels.entity";
import {
    Billing,
    MembershipPlanDuration,
    MembershipPlans,
} from "./../../entities/membership-plans.entity";
import { BaseSeeder } from "./base.seeder";

/**
 * 订阅计划数据配置
 */
interface MembershipPlanConfig {
    name: string;
    durationConfig: MembershipPlanDuration;
    label?: string;
    sort: number;
}

/**
 * 订阅计划 Seeder
 *
 * 初始化订阅计划数据
 * 依赖: MembershipLevelsSeeder 必须先执行
 */
export class MembershipPlansSeeder extends BaseSeeder {
    readonly name = "MembershipPlansSeeder";
    readonly priority = 70;

    /**
     * 订阅计划配置数据
     */
    private readonly planConfigs: MembershipPlanConfig[] = [
        {
            name: "月度会员",
            durationConfig: MembershipPlanDuration.MONTH,
            label: "特惠 10%",
            sort: 3,
        },
        {
            name: "季度会员",
            durationConfig: MembershipPlanDuration.QUARTER,
            label: "特惠 20%",
            sort: 2,
        },
        {
            name: "年度会员",
            durationConfig: MembershipPlanDuration.YEAR,
            label: "特惠 30%",
            sort: 1,
        },
    ];

    async run(dataSource: DataSource): Promise<void> {
        const planRepository = dataSource.getRepository(MembershipPlans);
        const levelRepository = dataSource.getRepository(MembershipLevels);

        try {
            // 获取所有会员等级
            const levels = await levelRepository.find({
                order: { level: "ASC" },
            });

            if (levels.length === 0) {
                this.logWarn("No membership levels found, skipping billing initialization");
            }

            let createdCount = 0;
            let updatedCount = 0;

            for (const config of this.planConfigs) {
                // 检查订阅计划是否已存在
                let plan = await planRepository.findOne({
                    where: { name: config.name },
                });

                // 为每个会员等级生成 billing 配置
                const billing: Billing[] = levels.map((level) => ({
                    levelId: level.id,
                    salesPrice: 0,
                    status: true,
                    label: "推荐",
                }));

                // 准备订阅计划数据
                const planData = {
                    name: config.name,
                    durationConfig: config.durationConfig,
                    label: config.label,
                    sort: config.sort,
                    billing,
                };

                if (!plan) {
                    // 创建新的订阅计划
                    plan = await planRepository.save(planData);
                    this.logInfo(`Created membership plan: ${plan.name}`);
                    createdCount++;
                } else {
                    // 更新已存在的订阅计划
                    await planRepository.update(plan.id, planData);
                    this.logInfo(`Updated membership plan: ${plan.name}`);
                    updatedCount++;
                }
            }

            this.logSuccess(
                `Membership plans initialized: created ${createdCount}, updated ${updatedCount}`,
            );
        } catch (error) {
            this.logError(`Membership plans initialization failed: ${error.message}`);
            throw error;
        }
    }
}
