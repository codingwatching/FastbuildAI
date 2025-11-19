<script setup lang="ts">
import SmartLink from "../../web/components/smart-link.vue";
</script>

<template>
    <SmartLink to="/">
        <UTooltip :text="$t('layouts.goHome')" :delay-duration="0">
            <UButton
                data-sidebar="trigger"
                variant="ghost"
                color="neutral"
                size="xs"
                :ui="{ base: 'py-2' }"
            >
                <UIcon name="i-lucide-house" class="size-4" />
                <span>{{ $t("common.goHomeText") }}</span>
            </UButton>
        </UTooltip>
    </SmartLink>
</template>
