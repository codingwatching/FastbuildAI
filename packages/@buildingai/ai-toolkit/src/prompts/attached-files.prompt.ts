export type AttachedDocument = { filename: string; content: string };

export function buildAttachedFilesSection(
    documents: AttachedDocument[],
    useToolForDocuments: boolean,
): string {
    if (!documents?.length) return "";

    if (useToolForDocuments) {
        const filenames = documents.map((d) => d.filename).join(", ");
        // 工具模式：仅列出文件名，提示模型通过 read_attached_file 工具按需读取文件内容。
        // 明确标注"本轮新上传"，避免模型将用户的模糊指代（如"这个文件"）误关联到历史对话中已处理的文件。
        return `<attached_files>\nThe user's CURRENT message has newly attached the following file(s): ${filenames}.\nWhen the user refers to "this file" or an attachment without naming it, they mean these newly attached file(s), NOT any file mentioned earlier in the conversation history (which may appear as plain text placeholders and have already been answered).\nUse the read_attached_file tool to read a file's content when you need to answer questions about it.\n</attached_files>`;
    }

    const docTexts = documents.map((d) => `[本轮新上传的文档: ${d.filename}]\n\n${d.content}`);
    // 直接嵌入模式：将文件内容内联到系统提示中，同样标注"本轮新上传"以区分历史文件，
    // 避免模型在多轮带文件对话中产生指代混淆。
    return `<attached_files>\nThe following document(s) are newly attached in the user's CURRENT message. When the user refers to "this file" without naming it, they mean these documents, NOT any file mentioned earlier in the conversation history.\n</attached_files>\n\n${docTexts.join("\n\n")}`;
}
