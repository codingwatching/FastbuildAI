import { ScheduleService } from "@buildingai/core";
import { ScheduleModule as NestScheduleModule } from "@buildingai/core/@nestjs/schedule";
import { Module } from "@nestjs/common";

import { ScheduleController } from "./controllers/schedule.controller";

/**
 * 定时任务模块
 *
 * 基于 NestJS 内置的 ScheduleModule 实现的简单定时任务模块
 */
@Module({
    imports: [NestScheduleModule.forRoot()],
    controllers: [ScheduleController],
    providers: [ScheduleService],
    exports: [ScheduleService],
})
export class ScheduleModule {}
