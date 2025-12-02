<script setup lang="ts">
import {
    apiDeletePlan,
    apiGetPlanList,
    apiUpdateMembershipStatus,
    apiUpdatePlanSort,
    apiUpdatePlanStatus,
    type Duration,
    type Plan,
} from "@buildingai/service/consoleapi/membership-plan";

import type { TableColumn } from "#ui/types";

const { hasAccessByCodes } = useAccessControl();

const router = useRouter();

const message = useMessage();

const UButton = resolveComponent("UButton");
const USwitch = resolveComponent("USwitch");

const planStatus = ref<boolean>(false);
const planList = ref<Plan[]>();

const columns: TableColumn<Plan>[] = [
    {
        accessorKey: "name",
        header: $t("membership.console-membership.plan.table.name"),
    },
    {
        accessorKey: "durationConfig",
        header: $t("membership.console-membership.plan.table.durationConfig"),
        cell: ({ row }) => {
            return getDurationText(row.original.durationConfig, row.original.duration);
        },
    },
    {
        accessorKey: "levelCount",
        header: $t("membership.console-membership.plan.table.levelCount"),
    },
    {
        accessorKey: "status",
        header: $t("membership.console-membership.plan.table.status"),
        cell: ({ row }) => {
            return h(USwitch, {
                modelValue: row.original.status,
                disabled: !hasAccessByCodes(["plan:update"]),
                "onUpdate:modelValue": (value: boolean) => {
                    updatePlanStatus(row.original.id, value);
                },
            });
        },
    },
    {
        accessorKey: "sort",
        header: $t("membership.console-membership.plan.table.sort"),
    },
    {
        accessorKey: "actions",
        header: $t("membership.console-membership.plan.table.actions"),
        cell: ({ row }) => {
            return h(
                "div",
                { class: "flex items-center gap-1" },
                [
                    hasAccessByCodes(["plan:update"])
                        ? h(UButton, {
                              icon: "i-lucide-pen-line",
                              color: "primary",
                              variant: "ghost",
                              size: "xs",
                              label: $t("console-common.edit"),
                              onClick: () => {
                                  router.push({
                                      path: useRoutePath("plans:update"),
                                      query: { id: row.original.id },
                                  });
                              },
                          })
                        : null,
                    hasAccessByCodes(["plan:delete"])
                        ? h(UButton, {
                              icon: "i-lucide-trash",
                              color: "error",
                              variant: "ghost",
                              size: "xs",
                              label: $t("console-common.delete"),
                              onClick: () => {
                                  handleDelete(row.original.id as string);
                              },
                          })
                        : null,
                ].filter(Boolean),
            );
        },
    },
];

const handleDelete = async (id: string) => {
    try {
        await useModal({
            title: $t("membership.console-membership.plan.list.deleteTitle"),
            description: $t("membership.console-membership.plan.list.deleteMsg"),
            color: "error",
        });

        await apiDeletePlan(id);
        // 刷新列表
        getLists();
    } catch (error) {
        console.error(`${$t("membership.console-membership.plan.list.deleteFailed")}:`, error);
    }
};

const getLists = async () => {
    const { plansStatus, plans } = await apiGetPlanList();
    planStatus.value = plansStatus;
    planList.value = plans;
};

/**
 * 启用/停用会员功能
 */
const updateMembershipStatus = async () => {
    try {
        await apiUpdateMembershipStatus({ status: planStatus.value });
        getLists();
        message.success($t("membership.console-membership.plan.status.updateSuccess"));
    } catch (error) {
        console.error("Update membership status failed:", error);
    }
};

/**
 * 更新计划状态
 */
const updatePlanStatus = async (id: string, status: boolean) => {
    try {
        await apiUpdatePlanStatus(id, { status });
        getLists();
        message.success($t("membership.console-membership.plan.status.updateSuccess"));
    } catch (error) {
        console.error("Update plan status failed:", error);
    }
};

// 编辑排序相关状态
const sortPopoverStates = ref<Record<string, { open: boolean; value: number }>>({});

/**
 * 获取或创建 popover 状态
 */
function getSortPopoverState(id: string, defaultValue: number) {
    if (!sortPopoverStates.value[id]) {
        sortPopoverStates.value[id] = { open: false, value: defaultValue };
    }
    return sortPopoverStates.value[id];
}

/**
 * 确认修改排序
 */
async function confirmEditSort(item: Plan) {
    const state = sortPopoverStates.value[item.id];
    if (state) {
        item.sort = state.value;
        // 调用 API 更新排序
        try {
            await apiUpdatePlanSort(item.id, { sort: state.value });
            state.open = false;
            getLists();
            message.success($t("membership.console-membership.plan.list.updateSortSuccess"));
        } catch (error) {
            console.error(
                `${$t("membership.console-membership.plan.list.updateSortFailed")}:`,
                error,
            );
        }
    }
}

/**
 * 获取订阅时长文本
 */
function getDurationText(durationConfig: number, duration: Duration) {
    switch (durationConfig) {
        case 1:
            return $t("membership.console-membership.plan.duration.month");
        case 2:
            return $t("membership.console-membership.plan.duration.quarter");
        case 3:
            return $t("membership.console-membership.plan.duration.half");
        case 4:
            return $t("membership.console-membership.plan.duration.year");
        case 5:
            return $t("membership.console-membership.plan.duration.forever");
        case 6:
            return `${duration.value} ${duration.unit}`;
        default:
            return "";
    }
}

onMounted(() => {
    getLists();
});
</script>

<template>
    <div class="plans-config-container space-y-4 pb-8">
        <div class="flex flex-col justify-between">
            <h4 class="text-lg font-semibold">
                {{ $t("membership.console-membership.plan.status.title") }}
            </h4>
            <div class="text-sm text-gray-500">
                {{ $t("membership.console-membership.plan.status.description") }}
            </div>
        </div>
        <USwitch v-model="planStatus" @update:modelValue="updateMembershipStatus" />
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <h4 class="text-lg font-semibold">
                    {{ $t("membership.console-membership.plan.list.title") }}
                </h4>
                <AccessControl :codes="['plan:create']">
                    <UButton
                        color="primary"
                        icon="i-lucide-plus"
                        size="sm"
                        @click="router.push({ path: useRoutePath('plans:create') })"
                    >
                        {{ $t("membership.console-membership.plan.list.add") }}
                    </UButton>
                </AccessControl>
            </div>
            <UTable
                :data="planList"
                :columns="columns"
                :ui="{
                    base: 'table-fixed border-separate border-spacing-0',
                    thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
                    tbody: '[&>tr]:last:[&>td]:border-b-0',
                    th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
                    td: 'border-b border-default',
                }"
            >
                <template #sort-cell="{ row }">
                    <div class="group flex items-center gap-2">
                        <span class="text-sm">{{ row.original.sort ?? 0 }}</span>
                        <UPopover
                            v-model:open="
                                getSortPopoverState(row.original.id, row.original.sort ?? 0).open
                            "
                        >
                            <UButton
                                icon="i-lucide-pencil"
                                color="neutral"
                                variant="ghost"
                                size="xs"
                                class="opacity-0 transition-opacity group-hover:opacity-100"
                            />
                            <template #content>
                                <div class="flex items-center justify-center gap-2 p-4">
                                    <UInput
                                        v-model="
                                            getSortPopoverState(
                                                row.original.id,
                                                row.original.sort ?? 0,
                                            ).value
                                        "
                                        type="number"
                                        :placeholder="
                                            $t(
                                                'membership.console-membership.plan.form.inputPlaceholder',
                                            )
                                        "
                                    />
                                    <div class="flex justify-end gap-2">
                                        <UButton
                                            variant="outline"
                                            size="sm"
                                            @click="
                                                getSortPopoverState(
                                                    row.original.id,
                                                    row.original.sort ?? 0,
                                                ).open = false
                                            "
                                        >
                                            {{ $t("console-common.cancel") }}
                                        </UButton>
                                        <UButton size="sm" @click="confirmEditSort(row.original)">
                                            {{ $t("console-common.confirm") }}
                                        </UButton>
                                    </div>
                                </div>
                            </template>
                        </UPopover>
                    </div>
                </template>
            </UTable>
        </div>
    </div>
</template>
