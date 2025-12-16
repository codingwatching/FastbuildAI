import { StorageType } from "@buildingai/constants/shared";
import { apiUploadFile, type FileUploadResponse } from "@buildingai/service/common";

import { useStorageStore } from "@/stores/storage";

async function uploadToOSS(
    params: { file: File; description?: string; extensionId?: string },
    options?: { onProgress?: (percent: number) => void },
): Promise<FileUploadResponse> {
    const storageStore = useStorageStore();

    try {
        const signatureData = await storageStore.getOSSSignature({
            name: params.file.name,
            size: params.file.size,
        });

        const { signature, fullPath, fileUrl, metadata } = signatureData;

        const formData = new FormData();
        formData.append("key", fullPath);
        formData.append("success_action_status", "200");
        formData.append("policy", signature.policy);
        formData.append("x-oss-signature", signature.signature);
        formData.append("x-oss-signature-version", signature.ossSignatureVersion);
        formData.append("x-oss-credential", signature.ossCredential);
        formData.append("x-oss-date", signature.ossDate);
        formData.append("x-oss-security-token", signature.securityToken);
        formData.append("file", params.file);

        const xhr = new XMLHttpRequest();

        return new Promise((resolve, reject) => {
            // progress
            if (options?.onProgress) {
                xhr.upload.addEventListener("progress", (event) => {
                    if (event.lengthComputable) {
                        const percent = Math.round((event.loaded / event.total) * 100);
                        options.onProgress?.(percent);
                    }
                });
            }

            // listen complete
            xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve({
                        id: "",
                        type: "",
                        url: fileUrl,
                        originalName: metadata.originalName,
                        size: metadata.size,
                        extension: metadata.extension,
                    });
                } else {
                    const error = new Error(`OSS upload failed: ${xhr.status} ${xhr.statusText}`);
                    reject(error);
                }
            });

            // listen error
            xhr.addEventListener("error", () => {
                const error = new Error("OSS upload network error");
                reject(error);
            });

            // listen abort
            xhr.addEventListener("abort", () => {
                const error = new Error("OSS upload has been cancelled");
                reject(error);
            });

            // send
            xhr.open("POST", signature.host);
            xhr.send(formData);
        });
    } catch (error) {
        console.error("[Upload] OSS upload failed: ", error);
        throw error;
    }
}

async function uploadToLocal(
    params: { file: File; description?: string; extensionId?: string },
    options?: { onProgress?: (percent: number) => void },
): Promise<FileUploadResponse> {
    return await apiUploadFile(params, options);
}

export async function unifiedFileUpload(
    params: { file: File; description?: string; extensionId?: string },
    options?: { onProgress?: (percent: number) => void },
): Promise<FileUploadResponse> {
    const storageStore = useStorageStore();

    try {
        let storageType = storageStore.storageType;
        console.log(storageType);

        if (!storageType) {
            storageType = await storageStore.checkStorageType();
        }

        switch (storageType) {
            case StorageType.OSS:
                return await uploadToOSS(params, options);
            case StorageType.LOCAL:
                return await uploadToLocal(params, options);
        }

        return Promise.reject("Invalid storage type");
    } catch (error) {
        console.error("[Upload] upload failed:", error);
        throw error;
    }
}
