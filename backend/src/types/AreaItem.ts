import mainAPI, { areaItemFix } from '@/types/_Main';
import { Server } from '@/types/Server';
import { Card, Stat } from '@/types/Card';

export enum AreaItemType {
    band, attribute, magazine
}
export const AreaItemTypeList = ['乐队道具', '颜色道具', '杂志道具']

export class AreaItem {
    areaItemId: number;
    isExist: boolean = false;
    level: Array<number | null>;
    areaItemLevel: number
    areaItemName: Array<string | null>;
    description: { [areaItemLevel: number]: Array<string | null> };
    performance: { [areaItemLevel: number]: Array<string | null> };
    technique: { [areaItemLevel: number]: Array<string | null> };
    visual: { [areaItemLevel: number]: Array<string | null> };
    targetAttributes: Array<'cool' | 'happy' | 'pure' | 'powerful'>;
    targetBandIds: Array<number>;
    constructor(areaItemId: number) {
        this.areaItemId = areaItemId
        const areaItemData = areaItemFix[areaItemId.toString()] ?? mainAPI['areaItems'][areaItemId.toString()]
        if (areaItemData == undefined) {
            this.isExist = false;
            return
        }
        this.isExist = true;
        this.level = areaItemData['level'];
        this.areaItemName = areaItemData['areaItemName'];
        this.description = areaItemData['description'];
        this.performance = areaItemData['performance'];
        this.technique = areaItemData['technique'];
        this.visual = areaItemData['visual'];
        this.targetAttributes = areaItemData['targetAttributes'];
        this.targetBandIds = areaItemData['targetBandIds'];
    }
    calcStat(card: Card, areaItemLevel: number, cardSTat: Stat, server: Server): Stat {
        var emptyStat: Stat = {//空综合力变量
            performance: 0,
            technique: 0,
            visual: 0
        }
        if (!this.isExist) {
            return emptyStat
        }
        if (this.targetAttributes.includes(card.attribute) && this.targetBandIds.includes(card.bandId)) {
            var finalStat = {
                performance: this.performance[areaItemLevel.toString()][server] * cardSTat.performance / 100,
                technique: this.technique[areaItemLevel.toString()][server] * cardSTat.technique / 100,
                visual: this.visual[areaItemLevel.toString()][server] * cardSTat.visual / 100
            }
            return finalStat
        }
        else {
            return emptyStat
        }
    }
    getType(): AreaItemType {
        if (this.targetBandIds.length == 1) {
            return AreaItemType.band
        }
        if (this.targetAttributes.length == 1) {
            return AreaItemType.attribute
        }
        if (this.areaItemId >= 80) {
            return AreaItemType.magazine
        }
        if (this.areaItemId >= 73) {
            return AreaItemType.band
        }
        return AreaItemType.attribute
    }
    getPercent(level: number): Stat {
        if (level == 0) {
            return {
                performance: 0,
                technique: 0,
                visual: 0
            }
        }
        let res: Stat = {
            performance: parseFloat(this.performance[level.toString()][0]) / 100,
            technique: parseFloat(this.technique[level.toString()][0]) / 100,
            visual: parseFloat(this.visual[level.toString()][0]) / 100
        }
        return res
    }
}