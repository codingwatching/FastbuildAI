import { apiGetUploadSignature } from "@buildingai/service/common";

async function uploadOssFile(file: File, dir: string) {
    const { signature } = await apiGetUploadSignature();

    const formData = new FormData();
    formData.append("success_action_status", "200");
    formData.append("policy", signature.policy);
    formData.append("x-oss-signature", signature.signature);
    formData.append("x-oss-signature-version", signature.ossSignatureVersion);
    formData.append("x-oss-credential", signature.ossCredential);
    formData.append("x-oss-date", signature.ossDate);
    formData.append("key", dir + file.name);
    formData.append("x-oss-security-token", signature.securityToken);
    formData.append("file", file);

    return fetch(signature.host, {
        method: "POST",
        body: formData,
    });
}

export { uploadOssFile };
