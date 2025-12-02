import {
    Menu,
    MenuSourceType,
    MenuType,
    Permission,
    PermissionType,
} from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";

import { BaseUpgradeScript, UpgradeContext } from "../../index";

/**
 * 升级脚本 25.0.5
 *
 * 添加会员管理相关权限和菜单：
 *
 * 权限：
 * - levels:list, levels:update, levels:create (等级管理)
 * - plans:list, plans:update, plans:create (套餐管理)
 * - membership-order:list (会员订单)
 *
 * 菜单：
 * - membership (会员管理)
 *   - levels-list (等级列表)
 *     - levels-list-update (编辑)
 *     - levels-list-add (添加)
 *   - plans-list (套餐列表)
 *     - plans-list-update (编辑)
 *     - plans-list-add (添加)
 *
 * 添加财务管理下的会员订单菜单：
 * - financial (财务管理) <- 父菜单
 *   - membership-order (会员订单)
 */
export class Upgrade extends BaseUpgradeScript {
    readonly version = "25.0.5";

    /**
     * 执行升级逻辑
     *
     * @param context 升级上下文
     */
    async execute(context: UpgradeContext): Promise<void> {
        console.log("开始升级到版本 25.0.5");

        try {
            const { dataSource } = context;
            const menuRepository: Repository<Menu> = dataSource.getRepository(Menu);
            const permissionRepository: Repository<Permission> =
                dataSource.getRepository(Permission);

            // 先添加权限
            await this.addPermissions(permissionRepository);

            // 添加会员管理菜单
            await this.addMembershipMenus(menuRepository);

            // 添加会员订单菜单
            await this.addMembershipOrderMenu(menuRepository);

            this.success("版本 25.0.5 升级完成");
        } catch (error) {
            console.log("升级失败", error);
            throw error;
        }
    }

    /**
     * 添加会员管理相关权限
     *
     * @param permissionRepository 权限仓库
     */
    private async addPermissions(permissionRepository: Repository<Permission>): Promise<void> {
        const permissions = [
            // 等级管理权限
            {
                code: "levels:list",
                name: "permission.levels.list",
                description: "查看会员等级列表",
                group: "membership",
                groupName: "permission.group.membership",
            },
            {
                code: "levels:update",
                name: "permission.levels.update",
                description: "编辑会员等级",
                group: "membership",
                groupName: "permission.group.membership",
            },
            {
                code: "levels:create",
                name: "permission.levels.create",
                description: "创建会员等级",
                group: "membership",
                groupName: "permission.group.membership",
            },
            // 套餐管理权限
            {
                code: "plans:list",
                name: "permission.plans.list",
                description: "查看会员套餐列表",
                group: "membership",
                groupName: "permission.group.membership",
            },
            {
                code: "plans:update",
                name: "permission.plans.update",
                description: "编辑会员套餐",
                group: "membership",
                groupName: "permission.group.membership",
            },
            {
                code: "plans:create",
                name: "permission.plans.create",
                description: "创建会员套餐",
                group: "membership",
                groupName: "permission.group.membership",
            },
            // 会员订单权限
            {
                code: "membership-order:list",
                name: "permission.membershipOrder.list",
                description: "查看会员订单列表",
                group: "financial",
                groupName: "permission.group.financial",
            },
        ];

        for (const perm of permissions) {
            const existing = await permissionRepository.findOne({
                where: { code: perm.code },
            });

            if (!existing) {
                const newPermission = permissionRepository.create({
                    ...perm,
                    type: PermissionType.SYSTEM,
                    isDeprecated: false,
                } as Partial<Permission>);

                await permissionRepository.save(newPermission);
                console.log(`成功添加权限 ${perm.code}`);
            } else {
                console.log(`权限 ${perm.code} 已存在，跳过添加`);
            }
        }
    }

    /**
     * 添加会员管理菜单及其子菜单
     *
     * @param menuRepository 菜单仓库
     */
    private async addMembershipMenus(menuRepository: Repository<Menu>): Promise<void> {
        // 查找父菜单 - 系统管理 (code: "system-manage")
        const systemManageMenu = await menuRepository.findOne({
            where: { code: "system-manage" },
        });

        if (!systemManageMenu) {
            console.log("未找到父菜单 system-manage (系统管理)，跳过会员管理菜单添加");
            return;
        }

        // 检查会员管理菜单是否已存在
        let membershipMenu = await menuRepository.findOne({
            where: { code: "membership" },
        });

        if (!membershipMenu) {
            // 创建会员管理主菜单（在系统管理下）
            membershipMenu = menuRepository.create({
                name: "console-menu.membershipManagement.title",
                code: "membership",
                path: "membership",
                icon: "i-lucide-crown",
                component: "",
                permissionCode: undefined,
                parentId: systemManageMenu.id,
                sort: 650,
                isHidden: 0,
                type: MenuType.DIRECTORY,
                sourceType: MenuSourceType.SYSTEM,
            } as Partial<Menu>);

            await menuRepository.save(membershipMenu);
            console.log("成功添加菜单项 membership");
        } else {
            console.log("菜单 membership 已存在，跳过添加");
        }

        // 添加等级列表菜单
        await this.addLevelsMenus(menuRepository, membershipMenu.id);

        // 添加套餐列表菜单
        await this.addPlansMenus(menuRepository, membershipMenu.id);
    }

    /**
     * 添加等级列表菜单及其子菜单
     *
     * @param menuRepository 菜单仓库
     * @param parentId 父菜单ID
     */
    private async addLevelsMenus(
        menuRepository: Repository<Menu>,
        parentId: string,
    ): Promise<void> {
        // 检查等级列表菜单是否已存在
        let levelsMenu = await menuRepository.findOne({
            where: { code: "levels-list" },
        });

        if (!levelsMenu) {
            levelsMenu = menuRepository.create({
                name: "console-menu.membershipManagement.levelsList",
                code: "levels-list",
                path: "levels",
                icon: "",
                component: "/console/membership/levels/list",
                permissionCode: "levels:list",
                parentId,
                sort: 0,
                isHidden: 0,
                type: MenuType.MENU,
                sourceType: MenuSourceType.SYSTEM,
            } as Partial<Menu>);

            await menuRepository.save(levelsMenu);
            console.log("成功添加菜单项 levels-list");
        } else {
            console.log("菜单 levels-list 已存在，跳过添加");
        }

        // 添加编辑按钮
        const levelsUpdateMenu = await menuRepository.findOne({
            where: { code: "levels-list-update" },
        });

        if (!levelsUpdateMenu) {
            const updateMenu = menuRepository.create({
                name: "console-common.edit",
                code: "levels-list-update",
                path: "levels/edit",
                icon: "",
                component: "/console/membership/levels/edit",
                permissionCode: "levels:update",
                parentId: levelsMenu.id,
                sort: 0,
                isHidden: 1,
                type: MenuType.MENU,
                sourceType: MenuSourceType.SYSTEM,
            } as Partial<Menu>);

            await menuRepository.save(updateMenu);
            console.log("成功添加菜单项 levels-list-update");
        }

        // 添加新增按钮
        const levelsAddMenu = await menuRepository.findOne({
            where: { code: "levels-list-add" },
        });

        if (!levelsAddMenu) {
            const addMenu = menuRepository.create({
                name: "console-common.add",
                code: "levels-list-add",
                path: "levels/add",
                icon: "",
                component: "/console/membership/levels/add",
                permissionCode: "levels:create",
                parentId: levelsMenu.id,
                sort: 0,
                isHidden: 1,
                type: MenuType.MENU,
                sourceType: MenuSourceType.SYSTEM,
            } as Partial<Menu>);

            await menuRepository.save(addMenu);
            console.log("成功添加菜单项 levels-list-add");
        }
    }

    /**
     * 添加套餐列表菜单及其子菜单
     *
     * @param menuRepository 菜单仓库
     * @param parentId 父菜单ID
     */
    private async addPlansMenus(menuRepository: Repository<Menu>, parentId: string): Promise<void> {
        // 检查套餐列表菜单是否已存在
        let plansMenu = await menuRepository.findOne({
            where: { code: "plans-list" },
        });

        if (!plansMenu) {
            plansMenu = menuRepository.create({
                name: "console-menu.membershipManagement.plansList",
                code: "plans-list",
                path: "plans",
                icon: "",
                component: "/console/membership/plans/list",
                permissionCode: "plans:list",
                parentId,
                sort: 0,
                isHidden: 0,
                type: MenuType.MENU,
                sourceType: MenuSourceType.SYSTEM,
            } as Partial<Menu>);

            await menuRepository.save(plansMenu);
            console.log("成功添加菜单项 plans-list");
        } else {
            console.log("菜单 plans-list 已存在，跳过添加");
        }

        // 添加编辑按钮
        const plansUpdateMenu = await menuRepository.findOne({
            where: { code: "plans-list-update" },
        });

        if (!plansUpdateMenu) {
            const updateMenu = menuRepository.create({
                name: "console-common.edit",
                code: "plans-list-update",
                path: "plans/edit",
                icon: "",
                component: "/console/membership/plans/edit",
                permissionCode: "plans:update",
                parentId: plansMenu.id,
                sort: 0,
                isHidden: 1,
                type: MenuType.MENU,
                sourceType: MenuSourceType.SYSTEM,
            } as Partial<Menu>);

            await menuRepository.save(updateMenu);
            console.log("成功添加菜单项 plans-list-update");
        }

        // 添加新增按钮
        const plansAddMenu = await menuRepository.findOne({
            where: { code: "plans-list-add" },
        });

        if (!plansAddMenu) {
            const addMenu = menuRepository.create({
                name: "console-common.add",
                code: "plans-list-add",
                path: "plans/add",
                icon: "",
                component: "/console/membership/plans/add",
                permissionCode: "plans:create",
                parentId: plansMenu.id,
                sort: 0,
                isHidden: 1,
                type: MenuType.MENU,
                sourceType: MenuSourceType.SYSTEM,
            } as Partial<Menu>);

            await menuRepository.save(addMenu);
            console.log("成功添加菜单项 plans-list-add");
        }
    }

    /**
     * 添加会员订单菜单
     *
     * @param menuRepository 菜单仓库
     */
    private async addMembershipOrderMenu(menuRepository: Repository<Menu>): Promise<void> {
        // 查找父菜单 - 订单管理菜单 (path: "order", code: null)
        const orderMenu = await menuRepository.findOne({
            where: { path: "order", type: MenuType.DIRECTORY },
        });

        if (!orderMenu) {
            console.log("未找到父菜单 order (订单管理)，跳过会员订单菜单添加");
            return;
        }

        // 检查会员订单菜单是否已存在
        const existingMenu = await menuRepository.findOne({
            where: { code: "membership-order" },
        });

        if (existingMenu) {
            console.log("菜单 membership-order 已存在，跳过添加");
            return;
        }

        // 创建会员订单菜单
        const membershipOrderMenu = menuRepository.create({
            name: "console-menu.financial.orderMembership",
            code: "membership-order",
            path: "order-membership",
            icon: "",
            component: "/console/order/order-membership",
            permissionCode: "membership-order:list",
            parentId: orderMenu.id,
            sort: 1,
            isHidden: 0,
            type: MenuType.MENU,
            sourceType: MenuSourceType.SYSTEM,
        } as Partial<Menu>);

        await menuRepository.save(membershipOrderMenu);
        console.log("成功添加菜单项 membership-order");
    }
}

export default Upgrade;
