import { StorageType } from "@buildingai/constants/shared";
import {
    apiUploadFile,
    apiUploadFiles,
    apiUploadRemoteFile,
    type FileUploadResponse,
} from "@buildingai/service/common";

import { useStorageStore } from "@/stores/storage";

interface FileUploadParams {
    file: File;
    description?: string;
    extensionId?: string;
}

interface OssFileUploadParams {
    file: File | Blob;
    name: string;
    size: number;
    description?: string;
    extensionId?: string;
}

interface OssWrappedFileUploadOptions {
    onProgress?: (percent: number, bytes: number) => void;
}

async function fileUploadToOSS(
    params: OssFileUploadParams,
    options?: OssWrappedFileUploadOptions,
): Promise<FileUploadResponse> {
    const storageStore = useStorageStore();

    try {
        const { signature, fullPath, fileUrl, metadata } = await storageStore.getOSSSignature({
            name: params.name,
            size: params.size,
        });

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
                        options.onProgress?.(percent, event.loaded);
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

async function filesUploadToOSS(
    params: { files: File[]; description?: string; extensionId?: string },
    options?: OssWrappedFileUploadOptions,
) {
    const totalBytes = params.files.reduce((count, file) => count + file.size, 0);
    let uploadBytes = 0;

    const tasks = Promise.all(
        params.files.map((file) => {
            const fileParam: OssFileUploadParams = { file, size: file.size, name: file.name };
            if (params.description) fileParam.description = params.description;
            if (params.extensionId) fileParam.extensionId = params.extensionId;

            const fileOptions: OssWrappedFileUploadOptions = {};
            if (options?.onProgress) {
                fileOptions.onProgress = (_: number, bytes) => {
                    uploadBytes += bytes;

                    const percent = Math.round((uploadBytes / totalBytes) * 100);
                    options.onProgress?.(percent, totalBytes);
                };
            }

            return fileUploadToOSS(fileParam);
        }),
    );

    return await tasks;
}

async function fileUploadToLocal(
    params: FileUploadParams,
    options?: { onProgress?: (percent: number) => void },
): Promise<FileUploadResponse> {
    return await apiUploadFile(params, options);
}

export async function fileUploadUnified(
    params: FileUploadParams,
    options?: { onProgress?: (percent: number) => void },
): Promise<FileUploadResponse> {
    const storageStore = useStorageStore();

    try {
        let storageType = storageStore.storageType;
        if (!storageType) {
            storageType = await storageStore.checkStorageType();
        }

        switch (storageType) {
            case StorageType.OSS:
                return await fileUploadToOSS(
                    {
                        ...params,
                        name: params.file.name,
                        size: params.file.size,
                    },
                    options,
                );
            case StorageType.LOCAL:
                return await fileUploadToLocal(params, options);
        }

        return Promise.reject("Invalid storage type");
    } catch (error) {
        console.error("[Upload] upload failed:", error);
        throw error;
    }
}

export async function filesUploadUnified(
    params: { files: File[]; description?: string; extensionId?: string },
    options?: { onProgress?: (percent: number) => void },
) {
    const storageStore = useStorageStore();

    try {
        let storageType = storageStore.storageType;
        if (!storageType) {
            storageType = await storageStore.checkStorageType();
        }

        switch (storageType) {
            case StorageType.OSS:
                return await filesUploadToOSS(params, options);
            case StorageType.LOCAL:
                return await apiUploadFiles(params, options);
        }

        return Promise.reject("Invalid storage type");
    } catch (error) {
        console.error("[Upload] upload failed:", error);
        throw error;
    }
}

export async function uploadRemoteFileUnified(params: { url: string; description?: string }) {
    const storageStore = useStorageStore();

    try {
        let storageType = storageStore.storageType;
        if (!storageType) {
            storageType = await storageStore.checkStorageType();
        }

        switch (storageType) {
            case StorageType.OSS: {
                const response = await fetch(params.url);
                const file = await response.blob();

                const getFileNameFromUrl = (url: string) => {
                    const urlObj = new URL(url);
                    const pathname = urlObj.pathname;
                    return pathname.substring(pathname.lastIndexOf("/") + 1);
                };
                return await fileUploadToOSS({
                    file,
                    size: file.size,
                    name: getFileNameFromUrl(params.url),
                });
            }
            case StorageType.LOCAL:
                return apiUploadRemoteFile(params);
        }

        return Promise.reject("Invalid storage type");
    } catch (error) {
        console.error("[Upload] upload failed:", error);
        throw error;
    }
}
