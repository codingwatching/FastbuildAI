import { BaseController } from "@buildingai/base";
import { type UserPlayground } from "@buildingai/db";
import { BuildFileUrl, Playground, Public } from "@buildingai/decorators";
import { WebController } from "@common/decorators/controller.decorator";
import { QueryPlansDto } from "@modules/membership/dto/query-plans.dto";
import { SubmitMembershipOrderDto } from "@modules/membership/dto/submit-order.dto";
import { LevelsService } from "@modules/membership/services/levels.service";
import { MembershipOrderService } from "@modules/membership/services/order.service";
import { PlansService } from "@modules/membership/services/plans.service";
import { Body, Get, Post, Query } from "@nestjs/common";

@WebController("membership")
export class MembershipWebController extends BaseController {
    constructor(
        private readonly plansService: PlansService,
        private readonly membershipOrderService: MembershipOrderService,
        private readonly levelsService: LevelsService,
    ) {
        super();
    }

    /**
     * 获取订阅计划列表
     */
    @Get("plans")
    async plans(@Playground() user: UserPlayground) {
        return this.plansService.getConfig(user.id);
    }

    /**
     * 获取会员中心信息
     */
    @Get("center")
    @BuildFileUrl(["***.icon", "***.logo"])
    async center(@Query() query: QueryPlansDto, @Playground() user: UserPlayground) {
        return this.plansService.center(query, user.id);
    }

    /**
     * 会员订阅提交订单
     */
    @Post("submitOrder")
    async submitOrder(
        @Body() submitOrderDto: SubmitMembershipOrderDto,
        @Playground() user: UserPlayground,
    ) {
        const { planId, levelId, payType } = submitOrderDto;
        return this.membershipOrderService.submitOrder(
            planId,
            levelId,
            payType,
            user.id,
            user.terminal,
        );
    }

    /**
     * 获取会员等级列表
     *
     * @description 获取所有启用状态的会员等级列表，供前端选择组件使用
     * @returns 会员等级列表
     */
    @Get("levels")
    @Public()
    @BuildFileUrl(["***.icon"])
    async levels() {
        return this.levelsService.findAll({
            where: { status: true },
            order: { level: "ASC" },
            select: ["id", "name", "level", "icon", "description", "givePower", "benefits"],
        });
    }
}
