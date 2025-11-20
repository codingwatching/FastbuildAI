import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { ExtensionBillingModule } from "@buildingai/extension-sdk";
import { Module } from "@nestjs/common";

import { Example } from "../../db/entities/example.entity";
import { ExampleConsoleController } from "./controllers/console/example.controller";
import { ExampleWebController } from "./controllers/web/example.controller";
import { ExampleService } from "./services/example.service";

/**
 * Example Module
 *
 * Note: BillingService is globally available, no need to import BillingModule
 */
@Module({
    imports: [TypeOrmModule.forFeature([Example]), ExtensionBillingModule],
    controllers: [ExampleWebController, ExampleConsoleController],
    providers: [ExampleService],
    exports: [ExampleModule],
})
export class ExampleModule {}
