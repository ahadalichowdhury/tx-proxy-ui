import {
  getPlaylistSourceById as getPlaylistSourceByIdRepo,
  listAllPlaylistSources,
  listAllStreams,
  listManualStreams,
  getStreamById as getStreamByIdRepo,
} from "@/db/repositories";

export async function getAllStreams() {
  return listAllStreams();
}

export async function getManualStreams() {
  return listManualStreams();
}

export async function getAllPlaylistSources() {
  return listAllPlaylistSources();
}

export async function getPlaylistSourceById(id: number) {
  return getPlaylistSourceByIdRepo(id);
}

export async function getStreamById(id: number) {
  return getStreamByIdRepo(id);
}
