import { BaseService } from "@buildingai/base";
import {
    ACCOUNT_LOG_SOURCE,
    ACCOUNT_LOG_TYPE,
} from "@buildingai/constants/shared/account-log.constants";
import { PayConfigPayType } from "@buildingai/constants/shared/payconfig.constant";
import { AppBillingService } from "@buildingai/core/modules/billing/app-billing.service";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { User } from "@buildingai/db/entities";
import { Payconfig } from "@buildingai/db/entities";
import { RechargeOrder } from "@buildingai/db/entities";
import { HttpErrorFactory } from "@buildingai/errors";
import {
    WechatPayNotifyAnalysisParams,
    WechatPayNotifyParams,
} from "@buildingai/wechat-sdk/interfaces/pay";
import { PayfactoryService } from "@common/modules/pay/services/payfactory.service";
import { WxPayService } from "@common/modules/pay/services/wxpay.service";
import { PrepayDto } from "@modules/pay/dto/prepay.dto";
import { Injectable } from "@nestjs/common";
import { Repository } from "typeorm/repository/Repository";
@Injectable()
export class PayService extends BaseService<Payconfig> {
    constructor(
        @InjectRepository(Payconfig)
        private readonly payconfigRepository: Repository<Payconfig>,
        @InjectRepository(RechargeOrder)
        private readonly rechargeOrderRepository: Repository<RechargeOrder>,
        private readonly wxpayService: WxPayService, // 注入wxpay服务
        private readonly payfactoryService: PayfactoryService,
        private readonly appBillingService: AppBillingService,

        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {
        super(payconfigRepository);
    }

    /**
     * 预支付接口
     * @param prepayDto
     * @returns
     */
    async prepay(prepayDto: PrepayDto, userId: string) {
        const { orderId, payType, from } = prepayDto;
        let order: RechargeOrder | null = null;
        switch (from) {
            case "recharge":
                order = await this.rechargeOrderRepository.findOne({
                    where: {
                        id: orderId,
                        userId: userId,
                    },
                });
                if (!order) {
                    throw HttpErrorFactory.badRequest("充值订单不存在");
                }
                if (order.payStatus) {
                    throw HttpErrorFactory.badRequest("该订单已支付");
                }
                break;
            default:
                throw HttpErrorFactory.badRequest("无效的订单来源");
        }
        const orderAmount = Number(order?.orderAmount || 0);
        // 统一支付订单
        const PayOrder = {
            orderSn: order.orderNo,
            payType,
            from,
            amount: orderAmount,
        };
        const qrCode = await this.wxpayService.createwxPayOrder(PayOrder);

        return {
            qrCode,
            payType,
        };
    }

    /**
     * 获取支付状态
     * @param orderId
     * @param from
     * @returns
     */
    async getPayResult(orderId: string, from: string, userId: string) {
        let order: RechargeOrder | null = null;
        if ("recharge" == from) {
            order = await this.rechargeOrderRepository.findOne({
                where: {
                    id: orderId,
                    userId: userId,
                },
                select: ["id", "orderNo", "payStatus"],
            });
        }
        return order;
    }

    /**
     * 微信回调解析参数
     * @param playload
     * @param body
     */
    async notifyWxPay(params: WechatPayNotifyParams, body: Record<string, any>) {
        try {
            const wechatPayService = await this.payfactoryService.getPayService(
                PayConfigPayType.WECHAT,
            );
            const result = await wechatPayService.notifyPay(params);
            if (!result) {
                throw new Error("验证签名失败");
            }
            const decryptBody = await this.wxpayService.decryptPayNotifyBody(body);
            const method = decryptBody.attach;
            const analysisParams: WechatPayNotifyAnalysisParams = {
                outTradeNo: decryptBody.out_trade_no,
                transactionId: decryptBody.transaction_id,
                attach: decryptBody.attach,
                payer: decryptBody.payer,
                amount: decryptBody.amount,
            };
            // 检查方法是否存在
            if ("function" === typeof this[method]) {
                await this[method](analysisParams); // 动态调用
            } else {
                throw new Error(`方法 ${method} 未定义`);
            }
        } catch (error) {
            this.logger.error(`微信支付回调处理失败: ${error.message}`);
            console.log(`微信支付回调处理失败: ${error.message}`);
        }
    }

    /**
     * 充值回调
     * @param analysisParams
     * @returns
     */
    async recharge(analysisParams: WechatPayNotifyAnalysisParams) {
        const order = await this.rechargeOrderRepository.findOne({
            where: {
                orderNo: analysisParams.outTradeNo,
            },
        });
        if (!order) {
            return;
        }
        //应该要走退款逻辑
        if (1 == order.payStatus) {
            return;
        }
        const power = order.power;
        const givePower = order.givePower;
        await this.userRepository.manager.transaction(async (entityManager) => {
            if (power > 0) {
                await this.appBillingService.addUserPower(
                    {
                        amount: power,
                        accountType: ACCOUNT_LOG_TYPE.RECHARGE_INC,
                        userId: order.userId,
                        source: {
                            type: ACCOUNT_LOG_SOURCE.RECHARGE,
                            source: "用户充值",
                        },
                        remark: `充值成功`,
                        associationNo: order.orderNo,
                    },
                    entityManager,
                );
            }
            if (givePower > 0) {
                await this.appBillingService.addUserPower(
                    {
                        amount: givePower,
                        accountType: ACCOUNT_LOG_TYPE.RECHARGE_GIVE_INC,
                        userId: order.userId,
                        source: {
                            type: ACCOUNT_LOG_SOURCE.RECHARGE,
                            source: "用户充值",
                        },
                        remark: `用户充值赠送积分：${givePower}`,
                        associationNo: order.orderNo,
                    },
                    entityManager,
                );
            }
            //更新订单表，标记已支付
            await entityManager.update(RechargeOrder, order.id, {
                payStatus: 1,
                payTime: new Date(),
                transactionId: analysisParams.transactionId,
            });
            //更新用户累计充值余额;
            await entityManager.increment(
                User,
                { id: order.userId },
                "totalRechargeAmount",
                power + givePower,
            );
        });
    }
}
