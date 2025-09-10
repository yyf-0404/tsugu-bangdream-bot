import { Collection, Db, MongoClient } from 'mongodb';
import { buildResult } from '@/teamBuilder/types';

export class eventCompositionResult {
    compositionList: Array<buildResult>
    constructor() {
        this.compositionList = []
    }
}

export class compositionResultDB {
  private client: MongoClient;
  private db;


  constructor(uri: string, dbName: string) {
    this.client = new MongoClient(uri);
    this.db = this.client.db(dbName);
    //尝试连接数据库，如果连接失败则抛出错误
    this.connect().catch((err) => {
      console.log(`连接数据库失败 Error: ${err.message}`);
    });
  }

  private getCollection() {
    return this.db.collection('compositionResults');
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async init(eventId: number) {
    const key:number = eventId
    const data = new eventCompositionResult()
    await this.getCollection().insertOne({ _id: key, ...data })
    return data;
  }
  async addResult(eventId: number, result: buildResult) {
    var data: eventCompositionResult = await this.getEvent(eventId)
    data.compositionList.push(result)
    const res = await this.getCollection().updateOne({ _id: eventId }, { $set: data })
    return data
  }
  async getEvent(eventId: number): Promise<eventCompositionResult> {
    var data: eventCompositionResult
    const res = await this.getCollection().findOne({ _id: eventId })
    if (res == null) {
      data = await this.init(eventId)
    }
    else {
      data = res
    }
    return data;
  }
}