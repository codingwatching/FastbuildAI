import "@fancyapps/ui/dist/fancybox/fancybox.css";

import { cn } from "@buildingai/ui/lib/utils";
import { Fancybox } from "@fancyapps/ui";
import { type ImgHTMLAttributes, useEffect } from "react";

const PREVIEW_GROUP = "image-preview";
const PREVIEW_SELECTOR = `[data-fancybox="${PREVIEW_GROUP}"]`;

/**
 * 在当前页面绑定 Fancybox 预览
 *
 * 参考 ai-paint 的 useAiPaintFancybox，给所有带 data-fancybox="image-preview" 的图片绑定点击预览。
 */
export function useImagePreview() {
  useEffect(() => {
    Fancybox.bind(PREVIEW_SELECTOR, {});

    return () => {
      Fancybox.unbind(PREVIEW_SELECTOR);
      Fancybox.close();
    };
  }, []);
}

/**
 * 图片预览组件
 *
 * 与 ai-paint 的 FancyboxImage 完全一致：点击图片打开 Fancybox 放大/缩放/拖拽预览。
 */
export function ImagePreview({
  src,
  alt,
  caption,
  className,
  imageClassName,
  ...imageProps
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  imageClassName?: string;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "className">) {
  return (
    <a
      href={src}
      data-fancybox={PREVIEW_GROUP}
      data-caption={caption || alt}
      className={cn("block cursor-zoom-in overflow-hidden", className)}
    >
      <img src={src} alt={alt} className={imageClassName} {...imageProps} />
    </a>
  );
}
