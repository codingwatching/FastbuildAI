import type { StorageTypeType } from "@buildingai/constants/shared";
import { apiGetUploadSignature } from "@buildingai/service/common";
import { apiGetActiveStorage } from "@buildingai/service/webapi/storage-config";
import { defineStore } from "pinia";

export const useStorageStore = defineStore("storage", {
    state: () => ({
        storageType: null as StorageTypeType | null,
    }),
    actions: {
        getOSSSignature(file: { name: string; size: number }) {
            return apiGetUploadSignature({
                name: file.name,
                size: file.size,
            });
        },

        updateStorageType(storageType: StorageTypeType) {
            this.storageType = storageType;
        },

        clearCache() {
            this.storageType = null;
        },

        async checkStorageType(): Promise<StorageTypeType> {
            const result = await apiGetActiveStorage();
            this.storageType = result.storageType;
            return result.storageType;
        },
    },
});
