import { ExtensionWebController } from "@buildingai/core/decorators";
import type { UserPlayground } from "@buildingai/db";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { HttpErrorFactory } from "@buildingai/errors";
import { ExtensionBillingService } from "@buildingai/extension-sdk";
import { Get } from "@nestjs/common";

import { Example } from "../../../../db/entities/example.entity";

/**
 * Example Web Controller
 */
@ExtensionWebController("hello")
export class ExampleWebController {
    constructor(
        private readonly extensionBillingService: ExtensionBillingService,
        @InjectRepository(Example)
        private readonly exampleRepository: Repository<Example>,
    ) {}

    /**
     * Test Web API with billing
     */
    @Get()
    async getHello(@Playground() user: UserPlayground) {
        try {
            await this.exampleRepository.manager.transaction(async (entityManager) => {
                const result = await this.extensionBillingService.deductUserPower(
                    {
                        userId: user.id,
                        amount: 1,
                        remark: "测试一下子调用扣费",
                    },
                    entityManager,
                );
                return result;
            });
        } catch (error) {
            throw HttpErrorFactory.badRequest(`扣费失败，回滚操作: ${error.message}`);
        }
    }
}
