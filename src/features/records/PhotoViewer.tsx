import { useEffect, useRef } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { PhotoRow } from '@/db/repos/cards';

type Props = {
  photos: readonly PhotoRow[];
  /** null이면 닫혀 있다. */
  index: number | null;
  onClose(): void;
};

/** 사진 전체 화면 보기. 좌우로 넘기고 닫기 버튼이나 뒤로 가기로 닫는다. */
export function PhotoViewer({ photos, index, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const list = useRef<FlatList<PhotoRow>>(null);
  const open = index !== null;

  useEffect(() => {
    if (index !== null) list.current?.scrollToIndex({ index, animated: false });
  }, [index, width]);

  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {open ? (
          <FlatList
            ref={list}
            data={photos}
            horizontal
            pagingEnabled
            keyExtractor={(p) => p.id}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            windowSize={3}
            initialNumToRender={1}
            renderItem={({ item }) => (
              <View style={{ width, height }}>
                <Image
                  source={{ uri: item.localPath ?? undefined }}
                  style={styles.image}
                  resizeMode="contain"
                  accessibilityLabel="사진"
                />
              </View>
            )}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          onPress={onClose}
          style={styles.close}
          hitSlop={12}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  image: { flex: 1 },
  close: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 20 },
});
