<script setup lang="ts">
import { apiBatchUpdateAiModel } from "@buildingai/service/consoleapi/ai-model";
import type { AiModelInfo } from "@buildingai/service/consoleapi/ai-provider";
import { apiGetLevelListAll } from "@buildingai/service/consoleapi/membership-level";

const props = defineProps<{
    models: Set<AiModelInfo>;
    provider?: {
        id?: string;
        name?: string;
        iconUrl?: string;
    };
}>();

const emits = defineEmits<{
    (e: "close", v?: boolean): void;
}>();

const { t } = useI18n();
const toast = useMessage();

const membershipLevels = ref<{ label: string; value: string }[]>([]);

const columns = [
    { accessorKey: "name", header: t("ai-provider.backend.model.batchEdit.name") },
    { accessorKey: "billingRule", header: t("ai-provider.backend.model.batchEdit.billingRule") },
    { accessorKey: "membershipLevel", header: "会员等级" },
];

const models = computed(() => {
    if (props.models.size === 0) return [];
    return JSON.parse(JSON.stringify([...props.models])) as AiModelInfo[];
});

const { lockFn: handleSubmit, isLock } = useLockFn(async () => {
    try {
        const updateData = models.value.map((model) => ({
            id: model.id,
            name: model.name,
            model: model.model,
            maxContext: model.maxContext,
            isActive: model.isActive,
            billingRule: model.billingRule,
            membershipLevel: model.membershipLevel,
        }));

        await apiBatchUpdateAiModel(updateData);
        toast.success("设置成功");
        emits("close", true);
    } catch (error) {
        console.error("批量编辑失败:", error);
    }
});

/**
 * 获取会员等级
 */
const getMembershipLevels = async () => {
    try {
        const result = await apiGetLevelListAll();
        membershipLevels.value =
            result.map((item) => ({
                label: item.name,
                value: item.id,
            })) || [];
    } catch (error) {
        console.error("获取会员等级失败:", error);
    }
};

onMounted(() => {
    getMembershipLevels();
});
</script>
<template>
    <BdModal
        :ui="{
            content: 'max-w-4xl overflow-y-auto h-fit',
        }"
        @close="emits('close', false)"
    >
        <template #title>
            <div>
                <div class="flex flex-row items-center gap-4">
                    <h3 class="text-lg font-semibold">批量设置计费</h3>
                    <p class="text-muted-foreground text-sm">此配置仅在对话模式下生效</p>
                </div>
                <div class="text-muted-foreground flex items-center gap-2 text-sm">
                    <div v-if="provider?.iconUrl" class="flex-none">
                        <NuxtImg
                            :src="provider.iconUrl"
                            :alt="provider.name"
                            class="h-4 w-4 rounded object-cover"
                        />
                    </div>
                    <div v-else class="flex-none">
                        <UIcon name="i-lucide-building-office" class="h-4 w-4" />
                    </div>
                    <span>{{ provider?.name }}</span>
                </div>
            </div>
        </template>
        <UForm :state="models" @submit="handleSubmit">
            <UTable
                :columns="columns"
                :data="models"
                sticky
                class="h-120"
                :ui="{
                    base: 'table-fixed border-separate border-spacing-0',
                    thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
                    tbody: '[&>tr]:last:[&>td]:border-b-0',
                    th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r [&:nth-child(4)]:min-w-22',
                    td: 'border-b border-default cursor-pointer [&:nth-child(4)]:min-w-22',
                    tr: '[&:has(>td[colspan])]:hidden',
                }"
            >
                <template #billingRule-cell="{ row }">
                    <div class="flex w-full items-center gap-2">
                        <UFormField :name="`rows.${row.index}.billingRule.power`" class="flex-1">
                            <UInput
                                v-model.number="row.original.billingRule.power"
                                type="number"
                                placeholder=""
                                :min="0"
                                :ui="{ base: 'pr-32' }"
                                @blur="
                                    if (row.original.billingRule.power < 0)
                                        row.original.billingRule.power = 0;
                                "
                                class="w-68"
                            >
                                <template #trailing>
                                    <span class="text-muted-foreground text-sm">
                                        {{ t("ai-provider.backend.model.form.power") }}/ 1K Tokens
                                    </span>
                                </template>
                            </UInput>
                        </UFormField>
                    </div>
                </template>
                <template #membershipLevel-cell="{ row }">
                    <div class="flex w-full items-center gap-2">
                        <UFormField :name="`rows.${row.index}.membershipLevel`" class="flex-1">
                            <USelectMenu
                                v-model="row.original.membershipLevel"
                                multiple
                                :items="membershipLevels"
                                :searchInput="false"
                                placeholder="选择会员等级"
                                value-key="value"
                                class="w-64"
                            />
                        </UFormField>
                    </div>
                </template>
            </UTable>
            <div class="flex w-full justify-end gap-2 pt-3.5">
                <UButton color="neutral" variant="soft" @click="emits('close', false)">
                    {{ t("console-common.cancel") }}
                </UButton>
                <UButton color="primary" type="submit" :loading="isLock">
                    {{ t("console-common.save") }}
                </UButton>
            </div>
        </UForm>
    </BdModal>
</template>
