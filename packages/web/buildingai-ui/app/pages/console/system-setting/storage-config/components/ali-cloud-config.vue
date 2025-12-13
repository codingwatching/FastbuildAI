<script setup lang="ts">
import {
    apiUpdateStorageConfig,
    type StorageConfig,
} from "@buildingai/service/consoleapi/storage-config";
import { StorageType } from "@buildingai/service/consoleapi/storage-config";
import { boolean, object, string } from "yup";

const props = defineProps({
    data: {
        type: Object as PropType<StorageConfig<typeof StorageType.OSS>>,
        required: true,
    },
});

const emit = defineEmits<{
    (e: "update"): void;
}>();

const modalOpen = ref(false);
const loading = ref(false);

const { t } = useI18n();
const form = useTemplateRef("form");
const schema = object({
    storageType: string().required(),
    isActive: boolean().required(),
    config: object({
        bucket: string().required(t("storage-config.form.spaceName.placeholder")),
        accessKey: string().required(t("storage-config.form.accessKey.placeholder")),
        secretKey: string().required(t("storage-config.form.secretKey.placeholder")),
        domain: string().required(t("storage-config.form.spaceDomain.placeholder")),
        region: string().required(t("storage-config.form.region.placeholder")),
        arn: string().required(t("storage-config.form.arn.placeholder")),
    }),
});
const state = reactive<StorageConfig<typeof StorageType.OSS>>({
    ...props.data,
    config: { ...props.data.config },
});

async function handleSubmit() {
    try {
        loading.value = true;
        await apiUpdateStorageConfig(state);
        emit("update");
        modalOpen.value = false;
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <UModal
        v-model:open="modalOpen"
        :title="$t('storage-config.storage.local')"
        :ui="{ footer: 'justify-end' }"
        :dismissible="loading"
    >
        <UButton variant="ghost">{{ $t("storage-config.table.setting") }}</UButton>

        <template #body>
            <UForm
                ref="form"
                :schema="schema"
                :state="state"
                class="space-y-6"
                @submit="handleSubmit"
            >
                <UFormField
                    name="storageType"
                    :label="$t('storage-config.form.storageType.label')"
                    :ui="{ description: 'py-2' }"
                    :description="$t('storage-config.form.storageType.desc')"
                >
                    <URadioGroup
                        v-model="state.storageType"
                        :items="[
                            {
                                label: $t('storage-config.storage.oss'),
                                value: StorageType.OSS,
                            },
                        ]"
                    />
                </UFormField>

                <UFormField
                    required
                    :label="$t('storage-config.form.spaceName.label')"
                    name="config.bucket"
                >
                    <UInput
                        class="w-full"
                        v-model="state.config.bucket"
                        :placeholder="$t('storage-config.form.spaceName.placeholder')"
                    />
                </UFormField>

                <UFormField required label="ACCESS_KEY" name="config.accessKey">
                    <UInput
                        class="w-full"
                        v-model="state.config.accessKey"
                        :placeholder="$t('storage-config.form.accessKey.placeholder')"
                    />
                </UFormField>

                <UFormField required label="SECRET_KEY" name="config.secretKey">
                    <UInput
                        class="w-full"
                        v-model="state.config.secretKey"
                        :placeholder="$t('storage-config.form.secretKey.placeholder')"
                    />
                </UFormField>

                <UFormField
                    required
                    name="config.domain"
                    :ui="{ description: 'text-xs' }"
                    :label="$t('storage-config.form.spaceDomain.label')"
                    :description="$t('storage-config.form.spaceDomain.desc')"
                >
                    <UInput
                        class="w-full"
                        v-model="state.config.domain"
                        :placeholder="$t('storage-config.form.spaceDomain.placeholder')"
                    />
                </UFormField>

                <UFormField name="config.region" label="REGION" required>
                    <UInput
                        class="w-full"
                        v-model="state.config.region"
                        :placeholder="$t('storage-config.form.region.placeholder')"
                    />
                </UFormField>

                <UFormField
                    label="ARN"
                    name="config.arn"
                    required
                    :ui="{ description: 'text-xs' }"
                    :description="$t('storage-config.aliCloud.paramDesc')"
                >
                    <UInput
                        class="w-full"
                        v-model="state.config.arn"
                        :placeholder="$t('storage-config.form.arn.placeholder')"
                    />
                </UFormField>

                <UFormField :label="$t('storage-config.form.status')" name="isActive">
                    <USwitch v-model="state.isActive" :disabled="data.isActive" />
                </UFormField>
            </UForm>
        </template>

        <template #footer="{ close }">
            <UButton color="neutral" variant="outline" :disabled="loading" @click="close">{{
                $t("storage-config.cancel")
            }}</UButton>
            <UButton color="primary" :loading="loading" @click="() => form?.submit()">{{
                $t("storage-config.confirm")
            }}</UButton>
        </template>
        <template #description></template>
    </UModal>
</template>
