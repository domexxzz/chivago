/**
 * Telling a story, from wherever somebody is standing.
 *
 * This was written twice over: once inside the place screen, and about to be
 * written again for the bar at the foot of the map. Both need the same three
 * steps in the same order - open the camera, take a fix, upload - and both
 * need the same four answers when it goes wrong. Two copies of that would
 * have drifted within a week, and the half that drifts is always the error
 * handling, because nobody exercises it.
 *
 * The two halves stay apart on purpose. Picking runs on the tap; posting
 * runs when somebody is finished writing, and the caption travels with it.
 */

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { strings } from '@chivago/core';
import { api, type PickedMedia } from '../api/client.ts';
import { t } from '../i18n/locale.ts';

/**
 * The camera, or the file picker on the web.
 *
 * Null for a cancel AND for a camera that would not open, which are
 * different things to the code and the same thing to a person: nothing was
 * chosen. The refusal gets a toast; the cancel gets silence, because a
 * person who changed their mind does not need telling.
 */
export async function pickStoryMedia(onToast: (msg: string) => void): Promise<PickedMedia | null> {
  let result: ImagePicker.ImagePickerResult | undefined;
  try {
    await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos', 'images'],
      videoMaxDuration: 10,
      quality: 0.7,
    });
  } catch {
    onToast(t(strings.place.storyPickerUnavailable));
    return null;
  }
  if (!result || result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? (asset.type === 'video' ? 'story.mp4' : 'story.jpg'),
    type: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    file: (asset as { file?: Blob }).file,
  };
}

/**
 * Post it, with the fix the fence judges.
 *
 * Two of the server's refusals are things a person can act on from where
 * they are standing - the file is too big, the iPhone gave us a HEIC - so
 * those get the app's own words in their language. Everything else carries
 * the server's sentence, which is more specific than anything this layer
 * could invent.
 */
export async function postStory(
  placeId: string,
  media: PickedMedia,
  caption: string,
  onToast: (msg: string) => void,
): Promise<boolean> {
  let pos: Location.LocationObject;
  try {
    pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    onToast(t(strings.place.storyNoFix));
    return false;
  }

  const res = await api.tellStory(placeId, {
    media,
    caption,
    position: {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? null,
      mocked: pos.mocked ?? false,
    },
  });

  if (res.ok) return true;
  if (res.code === 'STORY_TOO_LARGE') onToast(t(strings.place.storyTooLarge));
  else if (res.code === 'STORY_HEIC') onToast(t(strings.place.storyHeic));
  else onToast(res.error);
  return false;
}
