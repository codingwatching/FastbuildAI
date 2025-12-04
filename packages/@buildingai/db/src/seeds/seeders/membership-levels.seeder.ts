import { DataSource } from "../../typeorm";
import { Benefits, MembershipLevels } from "./../../entities/membership-levels.entity";
import { BaseSeeder } from "./base.seeder";

/**
 * 会员等级数据配置
 */
interface MembershipLevelConfig {
    name: string;
    level: number;
    icon: string;
    benefits: Benefits[];
}

/**
 * 会员等级 Seeder
 *
 * 初始化会员等级数据
 */
export class MembershipLevelsSeeder extends BaseSeeder {
    readonly name = "MembershipLevelsSeeder";
    readonly priority = 60;

    /**
     * 会员等级配置数据
     */
    private readonly levelConfigs: MembershipLevelConfig[] = [
        {
            name: "白银会员",
            level: 1,
            icon: "/static/vip/1.jpg",
            benefits: [
                {
                    icon: "",
                    content: "这是一个白银会员",
                },
            ],
        },
        {
            name: "黄金会员",
            level: 2,
            icon: "/static/vip/2.jpg",
            benefits: [
                {
                    icon: "",
                    content: "这是一个黄金会员",
                },
            ],
        },
        {
            name: "星耀会员",
            level: 3,
            icon: "/static/vip/3.jpg",
            benefits: [
                {
                    icon: "",
                    content: "这是一个星耀会员",
                },
            ],
        },
    ];

    async run(dataSource: DataSource): Promise<void> {
        const repository = dataSource.getRepository(MembershipLevels);

        try {
            let createdCount = 0;
            let updatedCount = 0;

            for (const config of this.levelConfigs) {
                // 检查会员等级是否已存在
                let level = await repository.findOne({
                    where: { level: config.level },
                });

                // 准备会员等级数据
                const levelData = {
                    name: config.name,
                    level: config.level,
                    icon: config.icon,
                    benefits: config.benefits,
                };

                if (!level) {
                    // 创建新的会员等级
                    level = await repository.save(levelData);
                    this.logInfo(`Created membership level: ${level.name}`);
                    createdCount++;
                } else {
                    // 更新已存在的会员等级
                    await repository.update(level.id, levelData);
                    this.logInfo(`Updated membership level: ${level.name}`);
                    updatedCount++;
                }
            }

            this.logSuccess(
                `Membership levels initialized: created ${createdCount}, updated ${updatedCount}`,
            );
        } catch (error) {
            this.logError(`Membership levels initialization failed: ${error.message}`);
            throw error;
        }
    }
}
