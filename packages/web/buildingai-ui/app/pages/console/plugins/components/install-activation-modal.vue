<script lang="ts" setup>
import type { AppInfo } from "@buildingai/service/consoleapi/extensions";
import {
    apiGetApplicationByActivationCode,
    apiInstallExtension,
} from "@buildingai/service/consoleapi/extensions";
import { object, string } from "yup";

const emits = defineEmits<{
    (e: "close", success?: boolean): void;
}>();

const toast = useMessage();

const formData = reactive({
    activationCode: "",
});

const schema = object({
    activationCode: string().required("请输入激活码"),
});

// 状态管理：'input' 输入激活码，'preview' 预览应用
const currentStep = shallowRef<"input" | "preview">("input");
const appInfo = shallowRef<AppInfo | null>(null);
const isInstalling = shallowRef(false);

const { isLock, lockFn: handleQuery } = useLockFn(async () => {
    try {
        // 通过激活码获取应用信息
        const result: AppInfo = await apiGetApplicationByActivationCode(formData.activationCode);

        if (!result) {
            toast.error("激活码无效，未找到对应的应用，请检查激活码是否正确");
            return;
        }

        // 切换到预览状态
        appInfo.value = result;
        currentStep.value = "preview";
    } catch (error: unknown) {
        console.error("查询应用失败:", error);
    }
});

const handleBack = () => {
    currentStep.value = "input";
    appInfo.value = null;
};

const handleCancel = () => {
    emits("close", false);
};

const { lockFn: handleConfirmInstall } = useLockFn(async () => {
    if (!appInfo.value) return;

    try {
        isInstalling.value = true;
        // await apiInstallExtension(appInfo.value.key);
        toast.success("安装成功");
        // emits("close", true);
    } catch (error: unknown) {
        console.error("安装应用失败:", error);
    } finally {
        isInstalling.value = false;
    }
});
</script>

<template>
    <BdModal
        title="安装应用"
        :ui="{ content: currentStep === 'preview' ? 'max-w-2xl' : 'max-w-md' }"
        @close="handleCancel"
    >
        <template #title>
            <div class="flex items-center gap-2">
                <UButton
                    v-if="currentStep === 'preview'"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-arrow-left"
                    size="sm"
                    @click="handleBack"
                />
                <span>安装应用</span>
            </div>
        </template>

        <!-- 输入激活码步骤 -->
        <div v-if="currentStep === 'input'">
            <UForm
                :state="formData"
                :schema="schema"
                class="w-full space-y-4"
                @submit="handleQuery"
            >
                <UFormField label="激活码" name="activationCode" required>
                    <UInput
                        v-model="formData.activationCode"
                        placeholder="请输入"
                        size="lg"
                        :ui="{ root: 'w-full' }"
                    />
                </UFormField>

                <div class="flex justify-end gap-2 pt-4">
                    <UButton color="neutral" variant="outline" size="lg" @click="handleCancel">
                        取消
                    </UButton>
                    <UButton color="primary" size="lg" :loading="isLock" type="submit">
                        查询
                    </UButton>
                </div>
            </UForm>
        </div>

        <!-- 预览应用步骤 -->
        <div v-else-if="currentStep === 'preview' && appInfo" class="space-y-4">
            <!-- 1. 封面横幅 -->
            <div v-if="appInfo.cover" class="relative overflow-hidden rounded-lg">
                <div v-if="appInfo.cover" class="relative z-10 mb-4">
                    <NuxtImg
                        :src="appInfo.cover"
                        :alt="appInfo.name"
                        class="w-full rounded-lg object-cover"
                        style="max-height: 200px"
                    />
                </div>
            </div>

            <!-- 2. 图标及名字 -->
            <div class="flex items-center gap-4">
                <!-- 应用图标 -->
                <UAvatar
                    :src="appInfo.icon"
                    :alt="appInfo.name"
                    size="3xl"
                    :ui="{ root: 'rounded-lg flex-shrink-0' }"
                >
                    <template #fallback>
                        <UIcon name="i-lucide-puzzle" class="text-muted-foreground h-12 w-12" />
                    </template>
                </UAvatar>

                <!-- 应用名称 -->
                <div>
                    <h3 class="text-foreground text-lg font-semibold">
                        {{ appInfo.name }}
                    </h3>
                </div>
            </div>

            <!-- 3. 详情 -->
            <div class="space-y-2">
                <!-- 应用描述 -->
                <div v-if="appInfo.describe">
                    <p class="text-muted-foreground text-sm leading-relaxed">
                        {{ appInfo.describe }}
                    </p>
                </div>
            </div>
        </div>

        <template v-if="currentStep === 'preview'" #footer>
            <div class="flex justify-end gap-2">
                <UButton color="neutral" variant="outline" size="lg" @click="handleCancel">
                    取消
                </UButton>
                <UButton
                    color="primary"
                    size="lg"
                    :loading="isInstalling"
                    @click="handleConfirmInstall"
                >
                    确认安装
                </UButton>
            </div>
        </template>
    </BdModal>
</template>
