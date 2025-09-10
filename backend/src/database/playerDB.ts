import { MongoClient } from 'mongodb';
import { Server } from '@/types/Server';
import { Event } from '@/types/Event';
import { difficultyColorList, Song } from '@/types/Song';
import { eventTypeList, playerDetail } from '@/teamBuilder/types';

export class PlayerDB {
  private client: MongoClient;
  private db: any;


  constructor(uri: string, dbName: string) {
    this.client = new MongoClient(uri);
    this.db = this.client.db(dbName);
    //尝试连接数据库，如果连接失败则抛出错误
    this.connect().catch((err) => {
      console.log(`连接数据库失败 Error: ${err.message}`);
    });
  }

  private getCollection() {
    return this.db.collection('players');
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async init(playerId: number) {
    const key = playerId
    const data = new playerDetail(playerId)
    data.init()
    await this.getCollection().insertOne({ _id: key, ...data })
    return data;
  }
  async updCurrentEvent(playerId: number, server: Server, eventId: number) {
    var data: playerDetail = await this.getPlayer(playerId)
    data.currentEvent = eventId
    if (!data.eventSongs[eventId]) {
      const event = new Event(eventId)
      if (eventTypeList.includes(event.eventType)) {
        var defaultServer = server
        if (!event.startAt[defaultServer]) {
            defaultServer = Server.jp
        }
        await event.initFull()
        const list = data.eventSongs[eventId] = []
        if (event.eventType != 'challenge') {
          for (var element of event.musics[defaultServer]) {
              const song = new Song(element.musicId)
              list.push({
                  songId: song.songId,
                  difficulty: song.getMaxMetaDiffId()
              })
          }
        }
        else {
          const song = new Song(event.musics[defaultServer][0].musicId)
          list.push({
            songId: song.songId,
            difficulty: song.getMaxMetaDiffId()
          })
        }
      }
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }
  async resetSong(playerId: number, server: Server, eventId: number) {
    var data: playerDetail = await this.getPlayer(playerId)
    delete data.eventSongs[eventId]
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return this.updCurrentEvent(playerId, server, eventId)
  }
  async updateSong(playerId: number, eventId: number, id: number, songId: number, difficulty: number) {
    var data: playerDetail = await this.getPlayer(playerId)
    for (let i = 0; i < data.eventSongs[eventId].length; i += 1) {
      if (id >> i & 1) data.eventSongs[eventId][i] = { songId, difficulty }
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }
  async addCard(playerId: number, list) {
    var data: playerDetail = await this.getPlayer(playerId)
    for (const { id, illustTrainingStatus, limitBreakRank, skillLevel} of list) {
      data.cardList[id] = { illustTrainingStatus, limitBreakRank, skillLevel }
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }
  async delCard(playerId: number, list) {
    var data: playerDetail = await this.getPlayer(playerId)
    for (const id of list) {
      delete data.cardList[id]
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }
  
  async updateCharacterBouns(playerId: number, list) {
    var data: playerDetail = await this.getPlayer(playerId)
    for (const { characterId, potential, characterTask} of list) {
      data.characterBouns[characterId] = { potential, characterTask}
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }

  async updateAreaItem(playerId: number, list) {
    var data: playerDetail = await this.getPlayer(playerId)
    for (const { id, level} of list) {
      data.areaItem[id] = { level }
    }
    await this.getCollection().updateOne({ _id: playerId }, { $set: data })
    return data
  }

  async getPlayer(playerId: number): Promise<playerDetail | null> {
    var data: playerDetail
    const res = await this.getCollection().findOne({ _id: playerId })
    if (res == null) {
      data = await this.init(playerId)
    }
    else {
      data = new playerDetail(playerId)
      data.init(await this.getCollection().findOne({ _id: playerId }))
    }
    return data;
  }
}