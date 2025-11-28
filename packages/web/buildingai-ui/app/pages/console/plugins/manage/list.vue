<script lang="ts" setup>
import {
    ExtensionStatus,
    ExtensionSupportTerminal,
    ExtensionType,
} from "@buildingai/constants/shared";
import { ROUTES } from "@buildingai/constants/web/routes.constant";
import type {
    ExtensionFormData,
    ExtensionQueryRequest,
} from "@buildingai/service/consoleapi/extensions";
import {
    // apiDeleteExtension,
    apiDisableExtension,
    apiEnableExtension,
    apiGetExtensionList,
    apiInstallExtension,
    apiUninstallExtension,
    apiUpgradeExtension,
} from "@buildingai/service/consoleapi/extensions";
import type { TabsItem } from "@nuxt/ui";

const ExtensionChangelogDrawer = defineAsyncComponent(() => import("../components/changelog.vue"));
const ExtensionDetailDrawer = defineAsyncComponent(() => import("../components/details.vue"));
const AddLocalExtension = defineAsyncComponent(() => import("../components/add-extension.vue"));

const { t } = useI18n();
const overlay = useOverlay();
const toast = useMessage();

const extensionTypeItems: TabsItem[] = [
    {
        label: t("extensions.manage.tabs.all"),
        value: "all",
    },
    {
        label: t("extensions.manage.tabs.installed"),
        value: "installed",
    },
    {
        label: t("extensions.manage.tabs.uninstalled"),
        value: "uninstalled",
    },
];

const selectedTab = shallowRef("all");

const searchForm = shallowReactive<ExtensionQueryRequest>({
    type: undefined,
});

const getTerminalLabel = (terminalType: number): string => {
    const terminalMap: Record<number, string> = {
        [ExtensionSupportTerminal.WEB]: t("extensions.modal.terminalTypes.web"),
        [ExtensionSupportTerminal.WEIXIN]: t("extensions.modal.terminalTypes.weixin"),
        [ExtensionSupportTerminal.H5]: t("extensions.modal.terminalTypes.h5"),
        [ExtensionSupportTerminal.MP]: t("extensions.modal.terminalTypes.mp"),
        [ExtensionSupportTerminal.API]: t("extensions.modal.terminalTypes.api"),
    };
    return terminalMap[terminalType] || t("extensions.manage.unknown");
};

const { paging, getLists } = usePaging({
    fetchFun: apiGetExtensionList,
    params: searchForm,
});

const hasMore = computed(() => paging.items.length < paging.total);

const loadMore = () => {
    if (paging.loading) return;
    paging.page++;
    getLists({ append: true });
};

const handleSearch = useDebounceFn(() => {
    paging.page = 1;
    getLists();
}, 500);

const handleTabChange = (value: string | number) => {
    selectedTab.value = String(value);
    const tabValue = selectedTab.value;
    if (tabValue === "all") {
        delete searchForm.isInstalled;
    } else {
        searchForm.isInstalled = tabValue === "installed";
    }
    paging.page = 1;
    getLists();
};

const handleNavigate = (extension: ExtensionFormData) => {
    window.open(`${ROUTES.EXTENSIONS}/${extension.identifier}/buildingai-middleware`, "_blank");
};

const installingMap = reactive<Record<string, boolean>>({});
const upgradingMap = reactive<Record<string, boolean>>({});

const handleInstall = async (extension: ExtensionFormData) => {
    if (installingMap[extension.identifier]) {
        return;
    }

    try {
        installingMap[extension.identifier] = true;
        await apiInstallExtension(extension.identifier);
        paging.page = 1;
        await getLists();
        toast.success(t("console-common.messages.success"));
    } catch (error) {
        console.error("安装插件失败:", error);
    } finally {
        installingMap[extension.identifier] = false;
    }
};

const handleUpgrade = async (extension: ExtensionFormData) => {
    if (upgradingMap[extension.identifier]) {
        return;
    }

    try {
        upgradingMap[extension.identifier] = true;
        await apiUpgradeExtension(extension.identifier);
        paging.page = 1;
        await getLists();
        toast.success(t("console-common.messages.success"));
    } catch (error) {
        console.error("更新插件失败:", error);
    } finally {
        upgradingMap[extension.identifier] = false;
    }
};

const { lockFn: handleUninstall } = useLockFn(async (extension: ExtensionFormData) => {
    try {
        await apiUninstallExtension(extension.identifier);
        paging.page = 1;
        await getLists();
        toast.success(t("console-common.messages.success"));
    } catch (error) {
        console.error("卸载插件失败:", error);
    }
});

// const handleDelete = async (extension: ExtensionFormData) => {
//     await apiDeleteExtension(extension.id);
//     getLists();
// };

const handleEnable = async (extension: ExtensionFormData) => {
    try {
        await apiEnableExtension(extension.id);
        paging.page = 1;
        await getLists();
        toast.success(t("console-common.messages.success"));
    } catch (error) {
        console.error("启用插件失败:", error);
    }
};

const handleDisable = async (extension: ExtensionFormData) => {
    try {
        await apiDisableExtension(extension.id);
        paging.page = 1;
        await getLists();
        toast.success(t("console-common.messages.success"));
    } catch (error) {
        console.error("禁用插件失败:", error);
    }
};

const handleLocal = async (extension: ExtensionFormData, flag: boolean) => {
    const modal = overlay.create(AddLocalExtension);
    const instance = modal.open({
        isEdit: flag,
        id: extension.id,
        initialData: {
            name: extension.name,
            packName: extension.identifier,
            description: extension.description,
            version: extension.version,
            icon: extension.icon,
            type: extension.type,
            supportTerminal: extension.supportTerminal || [],
            author: extension.author || {
                avatar: "",
                name: "",
                homepage: "",
            },
        },
    });
    const shouldRefresh = await instance.result;
    if (shouldRefresh) {
        paging.page = 1;
        getLists();
    }
};

const handleDetailExtension = (extension: ExtensionFormData) => {
    const modal = overlay.create(ExtensionDetailDrawer);
    modal.open({
        isIdentifier: extension.isLocal,
        extensionId: extension.id as string,
        identifier: extension.identifier as string,
    });
};

const handleChangelogExtension = (extension: ExtensionFormData) => {
    const modal = overlay.create(ExtensionChangelogDrawer);
    modal.open({
        extension: extension,
        identifier: extension.identifier,
    });
};

onMounted(() => getLists());
</script>

<template>
    <div class="extension-manage-container flex h-full flex-col pb-5">
        <div class="header bg-background sticky top-0 z-10 pb-6">
            <div class="space-y-4">
                <div class="flex w-full flex-wrap justify-between gap-4">
                    <div class="flex items-end justify-end">
                        <UTabs
                            :items="extensionTypeItems"
                            v-model="selectedTab"
                            @update:model-value="handleTabChange"
                            class="block w-auto"
                        />
                    </div>

                    <div class="flex items-center gap-4">
                        <UInput
                            v-model="searchForm.name"
                            :placeholder="t('extensions.manage.search')"
                            @update:model-value="handleSearch"
                        />
                        <USelect
                            v-model="searchForm.type"
                            :items="[
                                {
                                    label: t('extensions.manage.filters.allTypes'),
                                    value: undefined,
                                },
                                {
                                    label: t('extensions.modal.extensionTypes.application'),
                                    value: ExtensionType.APPLICATION,
                                },
                                {
                                    label: t('extensions.modal.extensionTypes.function'),
                                    value: ExtensionType.FUNCTIONAL,
                                },
                            ]"
                            class="block w-auto"
                            :placeholder="t('extensions.manage.selectType')"
                        />
                        <UButton
                            icon="i-lucide-plus"
                            color="primary"
                            @click="handleLocal({} as ExtensionFormData, false)"
                        >
                            {{ t("extensions.manage.add") }}
                        </UButton>
                    </div>
                </div>
            </div>
        </div>

        <!-- Empty state -->
        <div
            v-if="!paging.loading && paging.items.length === 0"
            class="flex h-[calc(100vh-12rem)] flex-col items-center justify-center"
        >
            <UIcon name="i-lucide-puzzle" class="text-muted-foreground mb-4 size-10" />
            <h3 class="text-secondary-foreground mb-2 text-lg font-medium">
                {{ t("extensions.manage.empty.title") }}
            </h3>
            <p class="text-accent-foreground mb-4">
                {{ t("extensions.manage.empty.description") }}
            </p>
            <div class="flex gap-2">
                <UButton
                    icon="i-lucide-plus"
                    color="primary"
                    variant="outline"
                    :ui="{
                        leadingIcon: 'size-4',
                    }"
                    @click="handleLocal({} as ExtensionFormData, false)"
                >
                    {{ t("extensions.manage.add") }}
                </UButton>
                <UButton
                    trailing-icon="i-lucide-external-link"
                    :ui="{
                        trailingIcon: 'size-4',
                        leadingIcon: 'size-4',
                    }"
                    color="primary"
                    @click="handleLocal({} as ExtensionFormData, false)"
                >
                    {{ t("extensions.manage.store") }}
                </UButton>
            </div>
        </div>

        <div v-else class="grid h-[calc(100vh-12rem)]">
            <BdScrollArea class="h-full" :shadow="false">
                <BdInfiniteScroll
                    :loading="paging.loading"
                    :has-more="hasMore"
                    :loading-text="t('extensions.manage.loadingText')"
                    :no-more-text="paging.page !== 1 ? t('extensions.manage.noMoreText') : ' '"
                    @load-more="loadMore"
                >
                    <div
                        class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    >
                        <!-- Extension Cards -->
                        <div
                            v-for="extension in paging.items"
                            :key="extension.id"
                            class="bg-background border-muted relative h-[170px] overflow-hidden rounded-[6px] border border-solid transition duration-150 ease-out hover:shadow-[0_6px_8px_0_rgba(28,31,35,6%)]"
                        >
                            <div class="flex h-full w-full cursor-pointer flex-col gap-3.5 p-4">
                                <!-- Top Section: Title and Avatar -->
                                <div class="flex justify-between">
                                    <!-- Left Content -->
                                    <div class="flex w-[calc(100%-76px)] flex-col gap-1">
                                        <!-- Title with Verification -->
                                        <div class="flex items-center gap-1">
                                            <span
                                                class="text-foreground truncate text-[16px] leading-[22px] font-[500]"
                                            >
                                                {{ extension.name }}
                                            </span>
                                        </div>
                                        <!-- Description -->
                                        <span
                                            class="text-muted-foreground line-clamp-2 text-[14px] leading-[20px] font-normal wrap-break-word"
                                        >
                                            {{
                                                extension.description ||
                                                t("extensions.manage.noDescription")
                                            }}
                                        </span>
                                    </div>
                                    <!-- Right Avatar -->
                                    <div
                                        class="ml-[12px] h-[64px] w-[64px] flex-none overflow-hidden rounded-[10px]"
                                    >
                                        <UAvatar
                                            :src="extension.icon"
                                            :alt="extension.name"
                                            icon="i-lucide-puzzle"
                                            :ui="{
                                                root: 'size-full rounded-md bg-primary',
                                                icon: 'size-7 text-white',
                                            }"
                                        />
                                    </div>
                                </div>

                                <!-- Tag Section -->
                                <div class="flex items-center gap-2">
                                    <UBadge
                                        v-if="extension.version"
                                        color="neutral"
                                        variant="soft"
                                        :label="`v${extension.version}`"
                                    />
                                    <UBadge
                                        v-if="extension.isInstalled"
                                        :color="
                                            extension.status === ExtensionStatus.ENABLED
                                                ? 'success'
                                                : 'neutral'
                                        "
                                        variant="soft"
                                        :label="
                                            extension.status === ExtensionStatus.ENABLED
                                                ? t('extensions.manage.enable')
                                                : t('extensions.manage.disable')
                                        "
                                    />
                                    <UBadge
                                        v-for="supportTerminal in extension.supportTerminal"
                                        :color="
                                            supportTerminal === ExtensionSupportTerminal.WEB
                                                ? 'success'
                                                : supportTerminal === ExtensionSupportTerminal.API
                                                  ? 'info'
                                                  : 'neutral'
                                        "
                                        variant="soft"
                                        :label="getTerminalLabel(supportTerminal)"
                                    />
                                </div>

                                <!-- User Info Section -->
                                <div class="flex items-center gap-1 text-xs">
                                    <UAvatar
                                        color="primary"
                                        size="xs"
                                        :src="extension.author?.avatar"
                                        :ui="{ root: 'rounded-full bg-primary size-5' }"
                                    >
                                        <UIcon name="i-lucide-user" class="size-3 text-white" />
                                    </UAvatar>
                                    <div class="text-nowrap">
                                        {{
                                            extension.author.name ||
                                            t("extensions.manage.unknownAuthor")
                                        }}
                                    </div>
                                </div>

                                <!-- Bottom Actions -->
                                <div class="bg-background absolute right-3 bottom-3 flex gap-2">
                                    <UTooltip
                                        v-if="
                                            extension.type === ExtensionType.APPLICATION &&
                                            extension.isInstalled
                                        "
                                        :text="t('extensions.manage.manage')"
                                    >
                                        <UButton
                                            color="primary"
                                            icon="i-lucide-settings"
                                            variant="soft"
                                            size="sm"
                                            :label="t('extensions.manage.manage')"
                                            @click="handleNavigate(extension)"
                                        />
                                    </UTooltip>

                                    <UButton
                                        v-if="!extension.isInstalled"
                                        color="primary"
                                        variant="solid"
                                        icon="i-lucide-download"
                                        size="sm"
                                        :loading="installingMap[extension.identifier]"
                                        :label="$t('extensions.manage.install')"
                                        @click="handleInstall(extension)"
                                    />

                                    <UButton
                                        v-if="extension.hasUpdate"
                                        color="info"
                                        variant="subtle"
                                        icon="i-lucide-circle-fading-arrow-up"
                                        size="sm"
                                        :loading="upgradingMap[extension.identifier]"
                                        :label="$t('extensions.manage.upgrade')"
                                        @click="handleUpgrade(extension)"
                                    />

                                    <UDropdownMenu
                                        v-if="extension.isInstalled"
                                        :items="[
                                            [
                                                {
                                                    label: t('extensions.manage.detail'),
                                                    icon: 'i-lucide-info',
                                                    onSelect: () =>
                                                        handleDetailExtension(extension),
                                                },
                                                extension.isLocal
                                                    ? undefined
                                                    : {
                                                          label: t('extensions.manage.logs'),
                                                          icon: 'i-lucide-file-text',
                                                          onSelect: () =>
                                                              handleChangelogExtension(extension),
                                                      },
                                            ].filter((item) => item !== undefined),
                                            [
                                                {
                                                    label:
                                                        extension.status === ExtensionStatus.ENABLED
                                                            ? t('extensions.manage.disable')
                                                            : t('extensions.manage.enable'),
                                                    icon:
                                                        extension.status === ExtensionStatus.ENABLED
                                                            ? 'i-lucide-power-off'
                                                            : 'i-lucide-power',
                                                    color:
                                                        extension.status === ExtensionStatus.ENABLED
                                                            ? 'warning'
                                                            : 'success',
                                                    onSelect: () => {
                                                        if (
                                                            extension.status ===
                                                            ExtensionStatus.ENABLED
                                                        ) {
                                                            handleDisable(extension);
                                                        } else {
                                                            handleEnable(extension);
                                                        }
                                                    },
                                                },
                                            ],
                                            [
                                                extension.isLocal
                                                    ? {
                                                          label: t('console-common.edit'),
                                                          icon: 'i-lucide-pen-line',
                                                          onSelect: () =>
                                                              handleLocal(extension, true),
                                                      }
                                                    : undefined,
                                                {
                                                    label: t('extensions.manage.uninstall'),
                                                    icon: 'i-lucide-trash-2',
                                                    color: 'error',
                                                    onSelect: () => {
                                                        // if (extension.isLocal) {
                                                        //     handleDelete(extension);
                                                        // } else {
                                                        //     handleUninstall(extension);
                                                        // }
                                                        handleUninstall(extension);
                                                    },
                                                },
                                            ].filter((item) => item !== undefined),
                                        ]"
                                        :content="{ align: 'end', side: 'bottom', sideOffset: 4 }"
                                        :ui="{ content: 'w-32' }"
                                    >
                                        <UButton
                                            icon="i-lucide-ellipsis-vertical"
                                            color="neutral"
                                            variant="ghost"
                                            size="sm"
                                        />
                                    </UDropdownMenu>
                                </div>
                            </div>
                        </div>
                    </div>
                </BdInfiniteScroll>
            </BdScrollArea>
        </div>
    </div>
</template>
