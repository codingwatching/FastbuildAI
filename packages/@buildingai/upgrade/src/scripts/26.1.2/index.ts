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
 * - 为 userNo 为 NULL 或空字符串的老用户批量生成唯一编号
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
            await this.backfillUserNos(context);
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

    /**
     * 为 userNo 为 NULL 或空字符串的老用户批量生成唯一编号
     *
     * 生成规则与 generateNo 一致：日期前缀(YYYYMMDDHHmmss) + 6位随机数字
     *
     * @param context - Upgrade context
     */
    private async backfillUserNos(context: UpgradeContext): Promise<void> {
        const repo = context.dataSource.getRepository(User) as Repository<User>;

        // 统计需要处理的用户总数
        const totalNull = await repo.count({
            where: [{ userNo: IsNull() }, { userNo: "" }],
        });
        if (totalNull === 0) {
            this.log("All users already have userNo, skip");
            return;
        }
        this.log(`Found ${totalNull} users with NULL or empty userNo, starting backfill...`);

        let processed = 0;
        let skipped = 0;

        while (true) {
            // 查询本批 NULL 或空字符串用户，取 id 和 createdAt
            const users = await repo.find({
                where: [{ userNo: IsNull() }, { userNo: "" }],
                select: ["id", "createdAt"],
                take: BATCH_SIZE,
            });

            if (users.length === 0) {
                break;
            }

            // 获取当前数据库中所有已存在的 userNo（用于去重）
            const existingNos = await this.getExistingUserNos(repo);
            const existingSet = new Set(existingNos);

            // 为本批用户生成唯一 userNo
            const updates: Array<{ id: string; userNo: string }> = [];
            for (const user of users) {
                let userNo = this.generateUserNo(user.createdAt);
                // 确保不与已有 userNo 重复，也不与本批已生成的重复
                let attempts = 0;
                while (existingSet.has(userNo) || updates.some((u) => u.userNo === userNo)) {
                    userNo = this.generateUserNo(user.createdAt);
                    attempts++;
                    if (attempts > 10) {
                        // 极端情况下退出，跳过该用户
                        this.log(
                            `Failed to generate unique userNo for user ${user.id} after 10 attempts, skipping`,
                        );
                        skipped++;
                        break;
                    }
                }
                if (attempts <= 10) {
                    updates.push({ id: user.id, userNo });
                    existingSet.add(userNo);
                }
            }

            // 批量更新
            for (const update of updates) {
                await repo.update(update.id, { userNo: update.userNo });
            }

            processed += updates.length;
            this.log(
                `Batch done: ${updates.length} users updated (total: ${processed}/${totalNull}, skipped: ${skipped})`,
            );
        }

        this.log(`UserNo backfill complete: ${processed} users updated, ${skipped} skipped`);
    }

    /**
     * 获取数据库中所有已存在的 userNo
     *
     * @param repo - User repository
     * @returns 已存在的 userNo 数组
     */
    private async getExistingUserNos(repo: Repository<User>): Promise<string[]> {
        const result = await repo
            .createQueryBuilder("u")
            .select("u.userNo", "userNo")
            .where("u.userNo IS NOT NULL AND u.userNo != ''")
            .getRawMany<{ userNo: string }>();
        return result.map((r) => r.userNo);
    }

    /**
     * 生成唯一用户编号，格式与 generateNo 一致
     *
     * @param date - 日期时间基准，默认当前时间
     * @returns 日期前缀(YYYYMMDDHHmmss) + 6 位随机数字
     */
    private generateUserNo(date: Date = new Date()): string {
        const now = date;
        const datePrefix = [
            now.getFullYear(),
            (now.getMonth() + 1).toString().padStart(2, "0"),
            now.getDate().toString().padStart(2, "0"),
            now.getHours().toString().padStart(2, "0"),
            now.getMinutes().toString().padStart(2, "0"),
            now.getSeconds().toString().padStart(2, "0"),
        ].join("");

        let suffix = "";
        for (let i = 0; i < 6; i++) {
            suffix += Math.floor(Math.random() * 10);
        }

        return `${datePrefix}${suffix}`;
    }
}
