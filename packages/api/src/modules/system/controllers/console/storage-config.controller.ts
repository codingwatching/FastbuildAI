import { BaseController } from "@buildingai/base";
import { UUIDValidationPipe } from "@buildingai/pipe/param-validate.pipe";
import { ConsoleController } from "@common/decorators";
import { UpdateStorageConfigDto } from "@modules/system/dto/update-storage-config.dto";
import { Body, Get, Inject, Param, Patch } from "@nestjs/common";

import { StorageConfigService } from "../../services/storage-config.service";

@ConsoleController("system-storage-config", "存储配置")
export class StorageConfigController extends BaseController {
    @Inject(StorageConfigService)
    private storageService: StorageConfigService;

    @Get()
    storageConfigList() {
        return this.storageService.getAllConfigs();
    }

    @Patch(":id")
    async updateStorageConfig(
        @Param("id", UUIDValidationPipe) id: string,
        @Body() body: UpdateStorageConfigDto,
    ) {
        await this.storageService.updateConfig(id, body);
    }
}
