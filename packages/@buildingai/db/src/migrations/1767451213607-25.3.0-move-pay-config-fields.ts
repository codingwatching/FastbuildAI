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
        // 添加新的 config 列（如果不存在）
        await queryRunner.query(`
            ALTER TABLE "payconfig"
            ADD COLUMN IF NOT EXISTS "config" jsonb NULL
        `);

        await queryRunner.query(`COMMENT ON COLUMN "payconfig"."config" IS '具体支付方式的配置'`);

        // 迁移数据
        const configs = await queryRunner.query(`
            SELECT
                id,
                pay_type,
                app_id,
                merchant_type,
                pay_version,
                mch_id,
                api_key,
                pay_sign_key,
                cert,
                pay_auth_dir,
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

            const payTypeNum =
                typeof row.pay_type === "string" ? parseInt(row.pay_type) : row.pay_type;
            if (payTypeNum === PayConfigPayType.WECHAT) {
                const wechatConfig: any = {
                    ...(config || {}),
                };

                if (row.app_id) wechatConfig.appId = row.app_id;
                if (row.mch_id) wechatConfig.mchId = row.mch_id;
                if (row.api_key) wechatConfig.apiKey = row.api_key;
                if (row.pay_sign_key) wechatConfig.paySignKey = row.pay_sign_key;
                if (row.cert) wechatConfig.cert = row.cert;
                if (row.merchant_type) wechatConfig.merchantType = row.merchant_type;
                if (row.pay_version) wechatConfig.payVersion = row.pay_version;
                if (row.pay_auth_dir) wechatConfig.payAuthDir = row.pay_auth_dir;

                config = wechatConfig;
            }

            // 更新数据库
            await queryRunner.query(`UPDATE payconfig SET config = $1 WHERE id = $2`, [
                JSON.stringify(config),
                row.id,
            ]);
        }

        // 删除旧字段
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "app_id"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "merchant_type"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "pay_version"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "mch_id"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "api_key"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "pay_sign_key"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "cert"`);
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "pay_auth_dir"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "app_id" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "merchant_type" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "pay_version" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "mch_id" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "api_key" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "pay_sign_key" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "cert" varchar NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "payconfig" ADD COLUMN IF NOT EXISTS "pay_auth_dir" varchar NULL`,
        );

        // 从 config 恢复数据
        const configs = await queryRunner.query(`SELECT id, pay_type, config FROM payconfig`);

        for (const row of configs) {
            if (!row.config) continue;

            let config: any = {};
            try {
                config = typeof row.config === "string" ? JSON.parse(row.config) : row.config;
            } catch {
                console.warn(`配置 ${row.id} 解析失败，跳过恢复`);
                continue;
            }

            const payTypeNum =
                typeof row.pay_type === "string" ? parseInt(row.pay_type) : row.pay_type;
            if (payTypeNum === PayConfigPayType.WECHAT) {
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
                    `
                    UPDATE payconfig
                        SET app_id = $1, merchant_type = $2, pay_version = $3,
                            mch_id = $4, api_key = $5, pay_sign_key = $6,
                            cert = $7, pay_auth_dir = $8
                        WHERE id = $9
                    `,
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
        }

        // 删除 config 列
        await queryRunner.query(`ALTER TABLE "payconfig" DROP COLUMN IF EXISTS "config"`);
    }
}
