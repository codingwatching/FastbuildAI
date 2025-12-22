import { Module } from "@nestjs/common";

import { StsService } from "./services/sts.service";

@Module({
    providers: [StsService],
    exports: [StsService],
})
export class StsModule {}
