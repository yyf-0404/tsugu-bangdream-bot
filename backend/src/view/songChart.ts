import { Song, difficultyName } from '@/types/Song'
import { Band } from '@/types/Band'
import * as BestdoriPreview from '@/components/BestdoriPreview.cjs'
import { getServerByPriority } from '@/types/Server'
import { Server } from '@/types/Server'
import { globalDefaultServer, serverNameFullList } from '@/config';
import { callAPIAndCacheResponse } from '@/api/getApi'
import { Bestdoriurl } from '@/config'

export async function drawSongChart(songId: number, difficultyId: number, displayedServerList: Server[] = globalDefaultServer, compress: boolean): Promise<Array<Buffer | string>> {
    const song = new Song(songId)
    if (!song.isExist) {
        return ['歌曲不存在']
    }
    await song.initFull()
    if (!song.difficulty[difficultyId]) {
        return ['难度不存在']
    }
    const server = getServerByPriority(song.publishedAt, displayedServerList)
    const band = new Band(song.bandId)
    const bandName = band.bandName[server]
    const songChart = await song.getSongChart(difficultyId)

    const tempcanv = await BestdoriPreview.DrawPreview({
        id: song.songId,
        title: song.musicTitle[server],
        artist: bandName,
        author: song.detail.lyricist[server],
        level: song.difficulty[difficultyId].playLevel,
        diff: difficultyName[difficultyId],
        cover: song.getSongJacketImageURL(displayedServerList)
    }, songChart as any)

    let buffer:Buffer
    if( compress!=undefined && compress){
        buffer = await tempcanv.toBuffer('jpeg',{quality:0.7})
    }
    else{
        buffer = await tempcanv.toBuffer('png')
    }

    return [buffer]
}

export async function drawCommunitySongChart(songId: number, compress: boolean): Promise<Array<Buffer | string>> {
    const res:any = await callAPIAndCacheResponse(`${Bestdoriurl}/api/post/details?id=${songId}`)
    if (!res?.result || res.result == 'false') {
        return ['获取谱面信息失败']
    }
    if (res.post?.categoryId != 'chart') {
        return [`id${songId}对应的帖子不是谱面，请检查是否输入错误`]
    }
    const cover = res.post.song.type == 'bandori' ? (new Song(res.post.song.id)).getSongJacketImageURL() : res.post.song.cover
    res.post.diff = difficultyName[res.post.diff]
    const tempcanv = await BestdoriPreview.DrawPreview({
        id: songId,
        ...res.post,
        cover
    }, res.post.chart as any)

    let buffer:Buffer
    if( compress!=undefined && compress){
        buffer = await tempcanv.toBuffer('jpeg',{quality:0.7})
    }
    else{
        buffer = await tempcanv.toBuffer('png')
    }

    return [buffer]
}
