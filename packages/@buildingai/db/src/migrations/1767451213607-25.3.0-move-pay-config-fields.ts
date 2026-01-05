import { PayConfigPayType } from "@buildingai/constants/shared/payconfig.constant";
import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: move-pay-config-fields
 * Version: 25.3.0
 * Created: 2026-01-03T14:40:13.607Z
 */
export class MovePayConfigFields1767451213607 implements MigrationInterface {
    name = "MovePayConfigFields1767451213607";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Step 1: 添加新的 config 列（如果不存在）
        await queryRunner.query(`
            ALTER TABLE "payconfig" 
            ADD COLUMN IF NOT EXISTS "config" jsonb NULL
        `);

        await queryRunner.query(`
            COMMENT ON COLUMN "payconfig"."config" IS '具体支付方式的配置'
        `);

        // Step 2: 迁移数据
        const configs = await queryRunner.query(`
            SELECT 
                id, 
                "payType", 
                "appId", 
                "merchantType", 
                "payVersion",
                "mchId",
                "apiKey",
                "paySignKey",
                "cert",
                "payAuthDir",
                config 
            FROM payconfig
        `);

        // 更新每条记录
        for (const row of configs) {
            let config: any = {};

            // 解析现有 config（如果有）
            if (row.config) {
                try {
                    config = typeof row.config === "string" ? JSON.parse(row.config) : row.config;
                } catch (e) {
                    console.warn(`配置 ${row.id} 解析失败，将使用空配置`);
                }
            }

            // 根据支付类型组装配置
            if (row.payType === PayConfigPayType.WECHAT) {
                // 微信支付配置
                const wechatConfig: any = {
                    ...(config || {}), // 保留已有配置
                };

                if (row.appId) wechatConfig.appId = row.appId;
                if (row.mchId) wechatConfig.mchId = row.mchId;
                if (row.apiKey) wechatConfig.apiKey = row.apiKey;
                if (row.paySignKey) wechatConfig.paySignKey = row.paySignKey;
                if (row.cert) wechatConfig.cert = row.cert;
                if (row.merchantType) wechatConfig.merchantType = row.merchantType;
                if (row.payVersion) wechatConfig.payVersion = row.payVersion;
                if (row.payAuthDir) wechatConfig.payAuthDir = row.payAuthDir;

                config = wechatConfig;
            }

            // 更新数据库
            await queryRunner.query(`UPDATE payconfig SET config = $1 WHERE id = $2`, [
                JSON.stringify(config),
                row.id,
            ]);
        }

        // Step 3: 删除旧字段
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "appId"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "merchantType"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "payVersion"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "mchId"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "apiKey"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "paySignKey"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "cert"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "payAuthDir"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Step 1: 重新添加旧字段
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "appId" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "merchantType" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "payVersion" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "mchId" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "apiKey" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "paySignKey" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "cert" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "payAuthDir" varchar NULL`,
        );

        // Step 2: 从 config 恢复数据
        const configs = await queryRunner.query(`SELECT id, "payType", config FROM payconfig`);

        for (const row of configs) {
            if (!row.config) continue;

            let config: any = {};
            try {
                config = typeof row.config === "string" ? JSON.parse(row.config) : row.config;
            } catch (e) {
                console.warn(`配置 ${row.id} 解析失败，跳过恢复`);
                continue;
            }

            // 提取字段
            const appId = config.appId || null;
            const merchantType = config.merchantType || null;
            const payVersion = config.payVersion || null;
            const mchId = config.mchId || null;
            const apiKey = config.apiKey || null;
            const paySignKey = config.paySignKey || null;
            const cert = config.cert || null;
            const payAuthDir = config.payAuthDir || null;

            // 更新基础字段
            await queryRunner.query(
                `UPDATE payconfig 
                    SET "appId" = $1, "merchantType" = $2, "payVersion" = $3,
                        "mchId" = $4, "apiKey" = $5, "paySignKey" = $6, 
                        "cert" = $7, "payAuthDir" = $8
                    WHERE id = $9`,
                [
                    appId,
                    merchantType,
                    payVersion,
                    mchId,
                    apiKey,
                    paySignKey,
                    cert,
                    payAuthDir,
                    row.id,
                ],
            );
        }

        // Step 3: 删除 config 列
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "config"`);
    }
}
