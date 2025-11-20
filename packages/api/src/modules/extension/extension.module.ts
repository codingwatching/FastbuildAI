import { ExtensionsService } from "@buildingai/core/modules/extension/services/extension.service";
import { ExtensionConfigService } from "@buildingai/core/modules/extension/services/extension-config.service";
import { ExtensionSchemaService } from "@buildingai/core/modules/extension/services/extension-schema.service";
import {
    getCachedExtensionList,
    loadExtensionModule,
} from "@buildingai/core/modules/extension/utils/extension.utils";
import { UploadModule } from "@buildingai/core/modules/upload/upload.module";
import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { Extension } from "@buildingai/db/entities";
import { DataSource } from "@buildingai/db/typeorm";
import { TerminalLogger } from "@buildingai/logger";
import { DynamicModule, Module, OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import { Pm2Module } from "../pm2/pm2.module";
import { ExtensionConsoleController } from "./controllers/console/extension.controller";
import { ExtensionMarketService } from "./services/extension-market.service";
import { ExtensionOperationService } from "./services/extension-operation.service";
import { ExtensionSeedService } from "./services/extension-seed.service";

@Module({
    imports: [],
    providers: [],
    exports: [],
})
export class ExtensionCoreModule implements OnModuleInit {
    static async register(): Promise<DynamicModule> {
        const loadedExtensions: DynamicModule[] = [];

        const extensionList = getCachedExtensionList();

        if (extensionList.length === 0) {
            TerminalLogger.info("Extensions", "No enabled extensions found");
        } else {
            TerminalLogger.info(
                "Extensions",
                `Found ${extensionList.length} enabled extension(s): ${extensionList.map((e) => e.name).join(", ")}`,
            );

            for (const extensionInfo of extensionList) {
                const extensionModule = await loadExtensionModule(extensionInfo);
                if (extensionModule) {
                    loadedExtensions.push(extensionModule);
                }
            }
        }

        return {
            module: ExtensionCoreModule,
            imports: [
                Pm2Module,
                UploadModule,
                TypeOrmModule.forFeature([Extension]),
                ...loadedExtensions,
            ],
            providers: [
                ExtensionConfigService,
                ExtensionSchemaService,
                ExtensionsService,
                ExtensionMarketService,
                ExtensionOperationService,
                ExtensionSeedService,
            ],
            controllers: [ExtensionConsoleController],
            exports: [],
        };
    }

    /**
     * Execute seeds for newly installed extensions
     *
     * Called after all modules are initialized
     */
    async onModuleInit() {
        const extensionList = getCachedExtensionList();
        if (extensionList.length === 0) {
            return;
        }

        // Get DataSource from the module
        const dataSource = this.moduleRef.get(DataSource, { strict: false });
        const seedService = new ExtensionSeedService(dataSource);

        await seedService.executeNewExtensionSeeds(extensionList);
    }

    constructor(private readonly moduleRef: ModuleRef) {}
}
