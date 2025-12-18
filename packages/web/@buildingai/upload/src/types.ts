export interface FileUploadParams {
    file: File;
    description?: string;
    extensionId?: string;
}

export interface OssFileUploadParams {
    file: File | Blob;
    name: string;
    size: number;
    description?: string;
    extensionId?: string;
}

export interface OssWrappedFileUploadOptions {
    onProgress?: (percent: number, bytes: number) => void;
}
