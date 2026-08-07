import { User } from "@buildingai/db/entities";
import { IsNull, Not, Repository } from "@buildingai/db/typeorm";

import { BaseUpgradeScript, type UpgradeContext } from "../../index";

/**
 * 每批处理的用户数量
 */
const BATCH_SIZE = 500;

/**
 * Core upgrade script for version 26.1.2
 *
 * - 清理已注销用户占用的 openid、mpOpenid、unionid 和 username 唯一约束
 */
export default class Upgrade extends BaseUpgradeScript {
    readonly version = "26.1.2";

    /**
     * Runs data fixes for 26.1.2
     *
     * @param context - Upgrade context (DB and services)
     */
    async execute(context: UpgradeContext): Promise<void> {
        this.log("Starting upgrade to version 26.1.2");

        try {
            await this.clearDeletedUserOpenid(context);
            this.success("Upgrade 26.1.2 completed");
        } catch (error) {
            this.error("Upgrade 26.1.2 failed", error);
            throw error;
        }
    }

    /**
     * 清理已注销用户的 openid、mpOpenid、unionid 和 username
     *
     * 已注销用户的 openid、mpOpenid、unionid 和 username 仍然占用唯一约束，
     * 导致新用户无法使用相同的 openid 或 username 注册。
     * 此方法将这些已注销用户的 openid、mpOpenid、unionid 清空，
     * 并将 username 改为 username + 用户ID。
     *
     * @param context - Upgrade context
     */
    private async clearDeletedUserOpenid(context: UpgradeContext): Promise<void> {
        const repo = context.dataSource.getRepository(User) as Repository<User>;

        // 统计需要处理的已注销用户总数
        const totalDeleted = await repo.count({
            where: [
                {
                    deletedAt: Not(IsNull()),
                    openid: Not(IsNull()),
                },
                {
                    deletedAt: Not(IsNull()),
                    mpOpenid: Not(IsNull()),
                },
                {
                    deletedAt: Not(IsNull()),
                    unionid: Not(IsNull()),
                },
                {
                    deletedAt: Not(IsNull()),
                    username: Not(IsNull()),
                },
            ],
            withDeleted: true, // 关键：包含软删除的数据
        });

        if (totalDeleted === 0) {
            this.log("No deleted users with openid/mpOpenid/unionid/username, skip");
            return;
        }

        this.log(
            `Found ${totalDeleted} deleted users with openid/mpOpenid/unionid/username, starting cleanup...`,
        );

        let processed = 0;
        let batchCount = 0;
        const processedIds = new Set<string>(); // 记录已处理的用户 ID，避免死循环

        while (true) {
            // 查询本批已注销且有 openid/mpOpenid/unionid/username 的用户
            const users = await repo.find({
                where: [
                    {
                        deletedAt: Not(IsNull()),
                        openid: Not(IsNull()),
                    },
                    {
                        deletedAt: Not(IsNull()),
                        mpOpenid: Not(IsNull()),
                    },
                    {
                        deletedAt: Not(IsNull()),
                        unionid: Not(IsNull()),
                    },
                    {
                        deletedAt: Not(IsNull()),
                        username: Not(IsNull()),
                    },
                ],
                select: ["id", "openid", "mpOpenid", "unionid", "username"],
                take: BATCH_SIZE,
                withDeleted: true, // 关键：包含软删除的数据
            });

            // 过滤掉已处理的用户
            const unprocessedUsers = users.filter((user) => !processedIds.has(user.id));

            if (unprocessedUsers.length === 0) {
                break;
            }

            // 批量清空 openid、mpOpenid、unionid 并修改 username
            for (const user of unprocessedUsers) {
                await repo.update(user.id, {
                    openid: null as any,
                    mpOpenid: null as any,
                    unionid: null as any,
                    username: `${user.username}__deleted_${user.id}`,
                });
                processedIds.add(user.id); // 标记为已处理
                processed++;
            }

            batchCount++;
            // 每 10 批输出一次进度
            if (batchCount % 10 === 0) {
                this.log(`Progress: ${processed}/${totalDeleted} users cleaned`);
            }
        }

        this.log(`Deleted user cleanup complete: ${processed} users cleaned`);
    }
}
