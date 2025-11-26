<script setup lang="ts">
import { ROUTES } from "@buildingai/constants/web";

import type { NavigationConfig } from "../../../../../buildingai-ui/app/components/console/page-link-picker/layout";
import Logo from "../../../../../buildingai-ui/public/logo.svg";

const UserProfile = defineAsyncComponent(() => import("../components/user-profile.vue"));
const SmartLink = defineAsyncComponent(() => import("../components/smart-link.vue"));
const MobileMenuButton = defineAsyncComponent(() => import("../components/mobile-menu-button.vue"));
const MobileNavigation = defineAsyncComponent(() => import("../components/mobile-navigation.vue"));

const props = defineProps<{
    navigationConfig: NavigationConfig;
    hasPreview?: boolean;
}>();

const userStore = useUserStore();
const appStore = useAppStore();

const mobileMenuOpen = shallowRef(false);

const sidebarMenus = computed(() => {
    return props.navigationConfig.items.map((item) => ({
        path: item.link?.path || "/",
        title: item.title,
        icon: item.icon || "i-lucide-circle",
        children: item.children,
    }));
});

const isActive = (path: string): boolean => {
    const route = useRoute();
    const pathname = window.location.pathname;

    const runtimeConfig = useRuntimeConfig();
    if (runtimeConfig.public.isPlugin) {
        return pathname === path;
    }

    return (
        pathname === path ||
        route.path === path ||
        route.path.startsWith(path + "/") ||
        route.meta.activePath === path
    );
};
</script>

<template>
    <div class="flex h-full min-h-full w-full flex-1">
        <!-- 固定侧边栏 -->
        <div
            class="bg-muted dark:bg-muted/50 fixed top-0 left-0 z-50 hidden h-full w-20 transition-[width,opacity] sm:block"
            :class="{ '!left-inherit !static !translate-x-0': hasPreview }"
        >
            <div class="flex h-full flex-col items-center">
                <!-- 顶部 Logo 区域 - 固定 -->
                <div class="flex-none py-4">
                    <SmartLink to="/" class="flex justify-center">
                        <h1 class="flex size-9 items-center justify-center rounded-lg">
                            <NuxtImg
                                v-if="appStore.siteConfig?.webinfo.logo"
                                :src="appStore.siteConfig?.webinfo.logo"
                                alt="Logo"
                                class="size-9"
                            />
                            <Logo
                                v-else
                                class="text-background size-9"
                                :fontControlled="false"
                                filled
                            />
                        </h1>
                    </SmartLink>
                </div>

                <!-- 中间菜单区域 - 可滚动 -->
                <div class="flex-1 overflow-y-auto px-2 py-2">
                    <div class="flex flex-col items-center gap-5">
                        <template v-for="item in sidebarMenus" :key="item.path">
                            <!-- 普通菜单项 -->
                            <SmartLink
                                :to="item.path"
                                :class="`group flex flex-col items-center justify-center gap-1 ${
                                    isActive(item.path) ? 'text-primary' : 'text-foreground/80'
                                }`"
                            >
                                <div
                                    class="group-hover:bg-foreground/5 flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                                    :class="
                                        isActive(item.path)
                                            ? 'bg-primary/[0.09] hover:bg-primary/[0.09]'
                                            : ''
                                    "
                                >
                                    <UIcon :name="item.icon" class="h-5 w-5" />
                                </div>
                                <span class="text-center text-xs">{{ item.title }}</span>
                            </SmartLink>
                        </template>
                    </div>
                </div>

                <!-- 底部区域 - 固定 -->
                <div class="flex flex-none flex-col items-center gap-6 py-4">
                    <!-- 帮助链接 -->
                    <ClientOnly>
                        <SmartLink
                            v-if="userStore.userInfo?.permissions"
                            :to="ROUTES.CONSOLE"
                            class="group text-foreground/80 flex flex-col items-center gap-1"
                        >
                            <div
                                class="group-hover:bg-foreground/5 flex h-10 w-10 items-center justify-center rounded-full"
                                :class="isActive('/help') ? 'bg-primary/[0.09]' : ''"
                            >
                                <UIcon name="i-lucide-layout-dashboard" class="h-5 w-5" />
                            </div>
                            <span class="text-center text-xs">{{
                                $t("layouts.menu.workspace")
                            }}</span>
                        </SmartLink>
                    </ClientOnly>

                    <!-- 用户头像 -->
                    <UserProfile
                        size="md"
                        :collapsed="true"
                        :content="{
                            side: 'right',
                            align: 'end',
                            sideOffset: 10,
                            alignOffset: -10,
                        }"
                    />
                </div>
            </div>
        </div>

        <!-- 主要内容区域 -->
        <main
            class="bg-background ml-0 flex h-full flex-1 flex-col rounded-l-xl sm:ml-20"
            :class="{ '!ml-0 p-4 pl-0': hasPreview }"
        >
            <slot />
        </main>

        <!-- 移动端菜单按钮 -->
        <MobileMenuButton v-model="mobileMenuOpen" />
        <!-- 移动端导航菜单 -->
        <MobileNavigation v-model="mobileMenuOpen" :navigation-config="navigationConfig" />
    </div>
</template>
