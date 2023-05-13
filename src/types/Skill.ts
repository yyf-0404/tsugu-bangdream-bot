import { Canvas } from 'canvas'
import mainAPI from './_Main'


export class Skill {
    skillId: number;
    isExist: boolean = false;
    data: object;
    simpleDescription: Array<string | null>;
    description: Array<string | null>;
    duration: Array<number>;
    effectType: string;
    //'judge'|'score'|'damage'|'score_continued_note_judge'|'score_over_life'|'score_under_great_half'|'score'
    scoreUpMaxValue: number;

    constructor(skillId: number) {
        this.skillId = skillId
        if (mainAPI["skills"][this.skillId.toString()] == undefined) {
            this.isExist = false;
            return
        }
        this.isExist = true;
        this.skillId = this.skillId;
        this.data = mainAPI["skills"][this.skillId.toString()]
        this.simpleDescription = this.data['simpleDescription']
        this.description = this.data['description']
        this.duration = this.data['duration']
        this.effectType = this.getEffectType()
        this.scoreUpMaxValue = this.getScoreUpMaxValue()
    }
    getData() {
        return this.data
    }
    getEffectType(): string {//返回技能类型，如果存在多个效果，优先级为skillTypeList中排列的顺序
        const skillTypeList = [
            'judge', 'life', 'damage', 'score_continued_note_judge', 'score_over_life', 'score_under_great_half', 'score'
        ]

        var tempTypeList: Array<string> = []
        if (this.isExist == false) {
            return 'score'
        }
        if (this.data['activationEffect'] != undefined) {
            for (var i in this.data['activationEffect']['activateEffectTypes']) {
                tempTypeList.push(i)
            }
        }
        if (this.data['onceEffect'] != undefined) {
            tempTypeList.push(this.data['onceEffect']['onceEffectType'])
        }
        return findFirstString(tempTypeList, skillTypeList) || 'score'
    }
    getSkillDescription(): Array<string> {//返回完整技能描述，不同等级效果用'/'分割
        if (this.isExist == false) {
            return [null, null, null, null, null]
        }

        //生成持续时间列表(例如'3/4/5/6/7')
        var durationList: string = "";
        this.duration.forEach((value: number, index: number) => {
            durationList += value.toString();
            if (index !== this.duration.length - 1) {
                durationList += '/';
            }
        });

        var tempDescription = this.description
        if (this.data['onceEffect'] != undefined) {//如果包含onceEffect(比如恢复)
            //生成回复数值列表(例如' 3/4/5/6/7 ')
            var onceEffectValueList: string = " ";
            this.data['onceEffect']['onceEffectValue'].forEach((value: number, index: number) => {
                onceEffectValueList += value.toString();
                if (index !== this.data['onceEffect']['onceEffectValue'].length - 1) {
                    onceEffectValueList += '/';
                }
            });
            onceEffectValueList += " ";

            tempDescription = tempDescription.map((value) => {
                if (value == null) {
                    return null
                }
                return value.replace("{0}", onceEffectValueList)
            })

            if (this.data['activationEffect'] != undefined) {//如果同时包含持续时间的效果(比如加分)
                tempDescription = tempDescription.map((value) => {
                    if (value == null) {
                        return null
                    }
                    return value.replace("{1}", durationList)
                })
            }
        }
        else if (this.data['activationEffect'] != undefined) {//如果包含持续时间效果
            tempDescription = tempDescription.map((value) => {
                if (value == null) {
                    return null
                }
                return value.replace("{0}", durationList)
            })
        }

        return tempDescription;
    }
    getScoreUpMaxValue(): number {//返回最高加分数值
        if (this.isExist == false) {
            return 0
        }
        if (this.data['activationEffect'] != undefined) {
            var numbers: Array<number> = []
            if(this.data['activationEffect']['unificationActivateEffectValue'] != undefined){
                numbers.push(this.data['activationEffect']['unificationActivateEffectValue'])
            }
            for (var i in this.data['activationEffect']['activateEffectTypes']) {
                this.data['activationEffect']['activateEffectTypes'][i]['activateEffectValue'].forEach(element => {
                    if(element != null){
                        numbers.push(element)
                    }
                });

            }
            return Math.max(...numbers)
        }
        else {
            return 0
        }
    }



}

//通过输入array和caseArray，返回array中第一个出现caseArray中的元素
function findFirstString(inputArray: string[], caseArray: string[]): string | undefined {
    for (const str of caseArray) {
        if (inputArray.indexOf(str) !== -1) {
            return str;
        }
    }
    return undefined;
}