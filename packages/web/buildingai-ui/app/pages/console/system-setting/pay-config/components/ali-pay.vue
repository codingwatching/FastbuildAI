<script setup lang="ts">
import {
    type AlipayConfig,
    type AlipayPayConfigInfo,
    PayConfigPayType,
    type PayConfigType,
} from "@buildingai/constants/shared";
import { PayConfigPayTypeLabels } from "@buildingai/service/consoleapi/payconfig";
import { apiGetPayconfigById, apiUpdatePayconfig } from "@buildingai/service/consoleapi/payconfig";
import { number, object, string } from "yup";

const message = useMessage();
const { t } = useI18n();
const router = useRouter();
const route = useRoute();

type AlipayFormType = AlipayPayConfigInfo & { config: AlipayConfig };
const formData = shallowReactive<AlipayFormType>({
    id: "",
    name: "",
    logo: "",
    isEnable: 1,
    isDefault: 0,
    sort: 0,
    payType: PayConfigPayType.ALIPAY,
    config: {
        appId: "",
        gateway: "",
        privateKey: "",
        appCert: "",
        alipayPublicCert: "",
        alipayRootCert: "",
    },
});

const payType = computed(() => {
    const payTypeValue = formData.payType;
    return PayConfigPayTypeLabels[payTypeValue as PayConfigType] ?? "未知支付方式";
});

const payConfigId = computed(() => route.query.id as string);

const { lockFn: getPayconfigDetail, isLock } = useLockFn(async () => {
    if (!payConfigId.value) {
        message.error(t("payment-config.form.getPayconfigDetailFailedHelp"));
        router.back();
        return;
    }
    try {
        const data = await apiGetPayconfigById(payConfigId.value, PayConfigPayType.ALIPAY);
        formData.id = data.id;
        formData.name = data.name;
        formData.logo = data.logo;
        formData.isEnable = data.isEnable;
        formData.isDefault = data.isDefault;
        formData.sort = data.sort;
        if (data.config) {
            formData.config = data.config;
        }
    } catch (_error) {
        message.error(t("payment-config.form.getPayconfigDetailFailed"));
        router.back();
    }
});
onMounted(() => {
    getPayconfigDetail();
});
const { lockFn: submitForm, isLock: isSubmitting } = useLockFn(async () => {
    try {
        await apiUpdatePayconfig(formData);
        message.success(t("payment-config.form.updateSuccess"));
        router.back();
    } catch (error) {
        message.error(t("payment-config.form.updateFailed"));
        console.log(error);
    }
});
const schema = object({
    name: string().required(t("payment-config.validation.nameRequired")),
    sort: number().required(t("payment-config.validation.sortRequired")),
    config: object({
        appId: string().required(t("payment-config.validation.appIdRequired")),
        gateway: string()
            .required(t("payment-config.validation.gatewayRequired"))
            .url(t("payment-config.validation.gatewayUrl")),
        privateKey: string().required(t("payment-config.validation.privateKeyRequired")),
        appCert: string().required(t("payment-config.validation.appCertRequired")),
        alipayPublicCert: string().required(
            t("payment-config.validation.alipayPublicCertRequired"),
        ),
        alipayRootCert: string().required(t("payment-config.validation.alipayRootCertRequired")),
    }).required(),
});
</script>
<template>
    <!-- 加载状态 -->
    <div v-if="isLock" class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="text-primary-500 h-8 w-8 animate-spin" />
    </div>
    <UForm v-else :state="formData" :schema="schema" class="space-y-8" @submit="submitForm">
        <!-- 主要内容区域 -->
        <div class="grid grid-cols-1 gap-8 p-1 lg:grid-cols-3">
            <!-- 左侧 -->
            <div class="shadow-default h-fit rounded-lg lg:col-span-1">
                <div class="flex flex-col items-center space-y-4" style="padding: 80px 24px 40px">
                    <!-- 上传 -->
                    <div class="flex items-start gap-4">
                        <UAvatar
                            :src="formData.logo"
                            alt="Alipay"
                            class="h-32 w-32"
                            :ui="{ root: 'rounded-lg' }"
                        />
                    </div>

                    <!-- 图标说明 -->
                    <div class="mt-6 px-12 text-center text-xs">
                        <p class="text-muted-foreground">
                            {{ t("payment-config.form.avatarFormats") }}
                        </p>
                    </div>

                    <!-- 状态开关 -->
                    <div class="mt-6 flex w-full items-center justify-between">
                        <div>
                            <h4 class="text-secondary-foreground text-sm font-medium">
                                {{ t("payment-config.form.enable") }}
                            </h4>
                            <p class="text-muted-foreground mt-2 text-xs">
                                {{ t("payment-config.form.alipayEnableHelp") }}
                            </p>
                        </div>
                        <USwitch
                            :model-value="!!formData.isEnable"
                            unchecked-icon="i-lucide-x"
                            checked-icon="i-lucide-check"
                            @change="
                                (value) => {
                                    formData.isEnable = !formData.isEnable ? 1 : 0;
                                }
                            "
                        />
                    </div>
                    <!-- 是否默认 -->
                    <div class="mt-6 flex w-full items-center justify-between">
                        <div>
                            <h4 class="text-secondary-foreground text-sm font-medium">
                                {{ t("payment-config.form.isDefault") }}
                            </h4>
                            <p class="text-muted-foreground mt-2 text-xs">
                                {{ t("payment-config.form.isDefaultHelp") }}
                            </p>
                        </div>
                        <USwitch
                            :model-value="!!formData.isDefault"
                            unchecked-icon="i-lucide-x"
                            checked-icon="i-lucide-check"
                            @change="
                                (value) => {
                                    formData.isDefault = !formData.isDefault ? 1 : 0;
                                }
                            "
                        />
                    </div>
                </div>
            </div>
            <!-- 右侧表单区域 -->
            <div class="shadow-default space-y-6 rounded-lg p-6 lg:col-span-2">
                <!-- 基本信息 -->
                <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <!-- 支付方式 -->
                    <UFormField :label="t('payment-config.form.payway')" name="payway">
                        <UInput
                            v-model="payType"
                            :placeholder="t('payment-config.form.payway')"
                            :disabled="true"
                            variant="subtle"
                            class="w-full"
                        />
                    </UFormField>
                    <!-- 自定义显示名称 -->
                    <UFormField :label="t('payment-config.form.name')" name="name" required>
                        <UInput
                            v-model="formData.name"
                            :placeholder="t('payment-config.form.nameInput')"
                            class="w-full"
                        />
                    </UFormField>
                    <!-- APPID -->
                    <UFormField
                        :label="t('payment-config.form.appId')"
                        name="config.appId"
                        required
                        :description="t('payment-config.form.appIdHelp')"
                    >
                        <UInput
                            v-model="formData.config.appId"
                            :placeholder="t('payment-config.form.appIdInput')"
                            class="w-full"
                        />
                    </UFormField>
                    <!-- 网关地址 -->
                    <UFormField
                        :label="t('payment-config.form.gateway') || '网关地址'"
                        name="config.gateway"
                        required
                        :description="
                            t('payment-config.form.gatewayHelp') || '支付宝开放平台网关地址'
                        "
                    >
                        <UInput
                            v-model="formData.config.gateway"
                            :placeholder="
                                t('payment-config.form.gatewayInput') ||
                                'https://openapi.alipay.com/gateway.do'
                            "
                            class="w-full"
                        />
                    </UFormField>
                    <!-- 应用私钥 -->
                    <UFormField
                        :label="t('payment-config.form.privateKey') || '应用私钥'"
                        name="config.privateKey"
                        required
                        :description="t('payment-config.form.privateKeyHelp') || '应用私钥内容'"
                    >
                        <UTextarea
                            v-model="formData.config.privateKey"
                            :placeholder="
                                t('payment-config.form.privateKeyInput') || '请输入应用私钥'
                            "
                            class="w-full"
                            autoresize
                            :maxrows="3"
                        />
                    </UFormField>
                    <!-- 应用公钥证书 -->
                    <UFormField
                        :label="t('payment-config.form.appCert') || '应用公钥证书'"
                        name="config.appCert"
                        required
                        :description="
                            t('payment-config.form.appCertHelp') ||
                            '应用公钥证书内容(appCertPublicKey)'
                        "
                    >
                        <UTextarea
                            v-model="formData.config.appCert"
                            :placeholder="
                                t('payment-config.form.appCertInput') || '请输入应用公钥证书内容'
                            "
                            class="w-full"
                            autoresize
                            :maxrows="3"
                        />
                    </UFormField>
                    <!-- 支付宝公钥证书 -->
                    <UFormField
                        :label="t('payment-config.form.alipayPublicCert') || '支付宝公钥证书'"
                        name="config.alipayPublicCert"
                        required
                        :description="
                            t('payment-config.form.alipayPublicCertHelp') ||
                            '支付宝公钥证书内容(alipayCertPublicKey)'
                        "
                    >
                        <UTextarea
                            v-model="formData.config.alipayPublicCert"
                            :placeholder="
                                t('payment-config.form.alipayPublicCertInput') ||
                                '请输入支付宝公钥证书内容'
                            "
                            class="w-full"
                            autoresize
                            :maxrows="3"
                        />
                    </UFormField>
                    <!-- 支付宝根证书 -->
                    <UFormField
                        :label="t('payment-config.form.alipayRootCert') || '支付宝根证书'"
                        name="config.alipayRootCert"
                        required
                        :description="
                            t('payment-config.form.alipayRootCertHelp') ||
                            '支付宝根证书内容(alipayRootCert)'
                        "
                    >
                        <UTextarea
                            v-model="formData.config.alipayRootCert"
                            :placeholder="
                                t('payment-config.form.alipayRootCertInput') ||
                                '请输入支付宝根证书内容'
                            "
                            class="w-full"
                            autoresize
                            :maxrows="3"
                        />
                    </UFormField>
                    <!-- 排序 -->
                    <UFormField
                        :label="t('payment-config.form.sort')"
                        name="sort"
                        required
                        :description="t('payment-config.form.sortHelp')"
                    >
                        <UInput v-model="formData.sort" class="w-full" />
                    </UFormField>
                </div>
                <!-- 底部操作按钮 -->
                <div class="flex justify-end gap-4">
                    <UButton
                        color="neutral"
                        variant="outline"
                        @click="router.back()"
                        class="px-8"
                        :loading="isLock || isSubmitting"
                    >
                        {{ t("console-common.cancel") }}
                    </UButton>
                    <UButton
                        color="primary"
                        :loading="isLock || isSubmitting"
                        type="submit"
                        class="px-8"
                    >
                        {{ t("console-common.update") }}
                    </UButton>
                </div>
            </div>
        </div>
    </UForm>
</template>
