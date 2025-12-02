/**
 * @fileoverview Web API service functions for member center management
 * @description This file contains API functions for member center operations,
 * membership subscription, order management, and related type definitions.
 *
 * @author BuildingAI Teams
 */

import type { BaseEntity } from "../models/globals";

// ==================== Type Definitions ====================

/**
 * 会员等级权益
 */
export interface MembershipBenefit {
    /** 权益名称 */
    content: string;
    /** 权益描述 */
    description?: string;
    /** 是否启用 */
    enabled: boolean;
}

/**
 * 会员等级信息
 */
export interface MembershipLevel extends BaseEntity {
    /** 等级名称 */
    name: string;
    /** 等级级别 */
    level: number;
    /** 赠送算力 */
    givePower: number;
    /** 权益列表 */
    benefits: MembershipBenefit[];
    /** 等级图标 */
    icon: string;
    /** 等级描述 */
    description?: string;
}

/**
 * 套餐计费项
 */
export interface PlanBillingItem {
    /** 等级ID */
    levelId: string;
    /** 原价 */
    originalPrice: number;
    /** 销售价 */
    salesPrice: number;
    /** 是否启用 */
    status: boolean;
    /** 等级信息 */
    level: MembershipLevel | null;
    /** 标签 */
    label: string;
}

/**
 * 订阅套餐信息
 */
export interface MembershipPlan extends BaseEntity {
    /** 套餐名称 */
    name: string;
    /** 套餐标签 */
    label: string;
    /** 时长配置 */
    durationConfig: number;
    /** 自定义时长 */
    duration?: {
        value: number;
        unit: string;
    };
    /** 状态 */
    status: boolean;
    /** 排序 */
    sort: number;
    /** 计费列表 */
    billing: PlanBillingItem[];
}

/**
 * 用户订阅信息
 */
export interface UserSubscription {
    /** 订阅ID */
    id: string;
    /** 等级信息 */
    level: MembershipLevel;
    /** 开始时间 */
    startTime: string;
    /** 结束时间 */
    endTime: string;
    /** 是否过期 */
    isExpired: boolean;
}

/**
 * 支付方式
 */
export interface PayWay {
    /** 支付方式ID */
    id: string;
    /** 支付方式名称 */
    name: string;
    /** 支付方式图标 */
    logo: string;
    /** 支付方式类型 */
    payType: number;
}

/**
 * 用户信息
 */
export interface MemberCenterUser extends BaseEntity {
    /** 用户编号 */
    userNo: string;
    /** 用户名 */
    username: string;
    /** 头像 */
    avatar: string;
    /** 算力 */
    power: number;
}

/**
 * 会员中心信息
 */
export interface MemberCenterInfo {
    /** 用户信息 */
    user: MemberCenterUser;
    /** 用户订阅信息 */
    userSubscription: UserSubscription | null;
    /** 订阅套餐列表 */
    plans: MembershipPlan[];
    /** 支付方式列表 */
    payWayList: PayWay[];
}

/**
 * 会员订单提交参数
 */
export interface MembershipOrderParams {
    /** 套餐ID */
    planId: string;
    /** 等级ID */
    levelId: string;
    /** 支付方式 */
    payType: number;
}

/**
 * 会员订单信息
 * @description 继承 BaseEntity 以保持与 OrderInfo 类型兼容
 */
export interface MembershipOrderInfo extends BaseEntity {
    /** 订单ID */
    orderId: string;
    /** 订单号 */
    orderNo: string;
    /** 订单金额 */
    orderAmount: number;
}

// ==================== Member Center Related APIs ====================

/**
 * 获取会员中心信息
 * @description 获取会员中心配置、用户信息和订阅状态
 * @param params 查询参数
 * @returns Promise with member center information
 */
export const apiGetMemberCenterInfo = (params?: { id?: string }): Promise<MemberCenterInfo> => {
    return useWebGet("/membership/center", params);
};

/**
 * 提交会员订单
 * @description 提交会员订阅订单
 * @param data 订单参数
 * @returns Promise with order information
 */
export const apiSubmitMembershipOrder = (
    data: MembershipOrderParams,
): Promise<MembershipOrderInfo> => {
    return useWebPost("/membership/submitOrder", data);
};

/**
 * 获取会员等级列表
 * @description 获取所有启用状态的会员等级列表，供选择组件使用
 * @returns Promise with membership level list
 */
export const apiGetMembershipLevels = (): Promise<MembershipLevel[]> => {
    return useWebGet("/membership/levels");
};
