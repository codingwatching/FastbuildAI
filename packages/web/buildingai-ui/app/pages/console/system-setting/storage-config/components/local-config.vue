<script setup lang="ts">
import {
    apiUpdateStorageConfig,
    type StorageConfig,
    StorageType,
} from "@buildingai/service/consoleapi/storage-config";
import { boolean, object, string } from "yup";

const props = defineProps({
    data: {
        type: Object as PropType<StorageConfig<typeof StorageType.LOCAL>>,
        required: true,
    },
});

const emit = defineEmits<{
    (e: "update"): void;
}>();

const modalOpen = ref(false);

const form = useTemplateRef("form");
const schema = object({
    storageType: string().required(),
    isActive: boolean().required(),
});
const state = reactive({
    ...props.data,
    config: null,
});

async function onSubmit() {
    await apiUpdateStorageConfig(state);
    emit("update");
    modalOpen.value = false;
}
</script>

<template>
    <UModal
        v-model:open="modalOpen"
        :title="$t('storage-config.storage.local')"
        :ui="{ footer: 'justify-end' }"
    >
        <UButton variant="ghost">{{ $t("storage-config.table.setting") }}</UButton>

        <template #body>
            <UForm ref="form" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
                <UFormField
                    name="storageType"
                    :label="$t('storage-config.form.storageType.label')"
                    :ui="{ description: 'py-2' }"
                    :description="$t('storage-config.form.storageType.desc')"
                >
                    <URadioGroup
                        v-model="state.storageType"
                        :items="[{ label: $t('storage-config.storage.local'), value: 'local' }]"
                    />
                </UFormField>

                <UFormField :label="$t('storage-config.form.status')" name="isActive">
                    <USwitch v-model="state.isActive" :disabled="props.data.isActive" />
                </UFormField>
            </UForm>
        </template>

        <template #footer="{ close }">
            <UButton color="neutral" variant="outline" @click="close">{{
                $t("storage-config.cancel")
            }}</UButton>
            <UButton color="primary" @click="() => form?.submit()">{{
                $t("storage-config.confirm")
            }}</UButton>
        </template>
        <template #description></template>
    </UModal>
</template>
