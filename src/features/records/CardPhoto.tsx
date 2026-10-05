import { memo, useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { thumbUri } from '@/platform/photoFiles';

type Props = { photoId: string; fullUri?: string | null; style: StyleProp<ImageStyle> };

/** 썸네일을 보여 주고, 캐시가 지워졌으면 보관본으로 바꾼다. */
export const CardPhoto = memo(function CardPhoto({ photoId, fullUri, style }: Props) {
  const [useFull, setUseFull] = useState(false);
  const uri = useFull && fullUri ? fullUri : thumbUri(photoId);
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="cover"
      onError={() => {
        if (fullUri) setUseFull(true);
      }}
    />
  );
});
