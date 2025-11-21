import { Menu, MenuSourceType, MenuType } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";

import { BaseUpgradeScript, UpgradeContext } from "../../index";

/**
 * 升级脚本 25.0.4
 *
 * 添加 DIY 设计预览菜单项
 *
 * 菜单层级结构：
 * - diy-center (DIY中心)
 *   - diy-micropage (微页面) <- 父菜单
 *     - diy-design (设计页面)
 *     - diy-design-view (预览页面) <- 本次添加的菜单
 *     - diy-create (创建按钮)
 *     - diy-edit (编辑按钮)
 */
export class Upgrade extends BaseUpgradeScript {
    readonly version = "25.0.4";

    /**
     * 执行升级逻辑
     *
     * @param context 升级上下文
     */
    async execute(context: UpgradeContext): Promise<void> {
        console.log("开始升级到版本 25.0.4");

        try {
            const { dataSource } = context;
            const menuRepository: Repository<Menu> = dataSource.getRepository(Menu);

            // 查找父菜单 diy-micropage (微页面菜单)
            const parentMenu = await menuRepository.findOne({
                where: { code: "diy-micropage" },
            });

            if (!parentMenu) {
                console.log("未找到父菜单 diy-micropage，跳过菜单添加");
                return;
            }

            // 检查菜单是否已存在
            const existingMenu = await menuRepository.findOne({
                where: { code: "diy-design-view" },
            });

            if (existingMenu) {
                console.log("菜单 diy-design-view 已存在，跳过添加");
                return;
            }

            // 创建新菜单项
            const newMenu = menuRepository.create({
                name: "console-common.check",
                code: "diy-design-view",
                path: "preview",
                icon: "",
                component: "/console/decorate/design/view",
                parentId: parentMenu.id,
                sort: 0,
                isHidden: 1,
                type: MenuType.MENU,
                sourceType: MenuSourceType.SYSTEM,
            } as Partial<Menu>);

            await menuRepository.save(newMenu);

            this.success("成功添加菜单项 diy-design-view");
        } catch (error) {
            console.log("升级失败", error);
            throw error;
        }
    }
}

export default Upgrade;
