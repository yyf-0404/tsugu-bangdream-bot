import * as fs from 'fs';
import { fuzzySearchPath } from '@/config';
import { isInteger } from '@/routers/utils';
import { logger } from './logger';

interface FuzzySearchConfig {
  [type: string]: { [key: string]: (string | number)[] };
}

function loadConfig(): FuzzySearchConfig {
  const fileContent = fs.readFileSync(fuzzySearchPath, 'utf-8');
  logger('fuzzySearch', 'loaded fuzzy search config');
  return JSON.parse(fileContent);
}

function extractLvNumber(str: string): number | null {
  const regex = /^lv(\d+)$/i;
  const match = str.match(regex);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}
function extractNoteNumber(str: string): number | null {
  const regex = /^(?:nt|note)(?:s)?(\d+)$/i;
  const match = str.match(regex);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}
function extractSkillNumber(str: string): number | null {
  const regex = /^(?:sk|skill)(\d+)$/i;
  const match = str.match(regex);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

export let config: FuzzySearchConfig = loadConfig();

export interface FuzzySearchResult {
  [key: string]: (string | number)[];
}

// 自定义验证函数
export function isFuzzySearchResult(value: any): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.values(value).every(
    (arr) =>
      Array.isArray(arr) &&
      arr.every((item) => typeof item === 'string' || typeof item === 'number')
  );
}

export function fuzzySearch(keyword: string): FuzzySearchResult {
  //兼容引号
  const keywordList = (keyword.match(/["“”『』「」]([^"“”『』「」]+)["“”『』「」]|\S+/g) || []).map(item =>
    item.replace(/^[\"“”『』「」]|[\"“”『』「」]$/g, '') // 去掉前后可能的中英文引号
  );

  // console.log(keywordList)
  const matches: { [key: string]: (string | number)[] } = {};

  for (var keyword_org of keywordList) {
    let matched = false;
    let keyword = keyword_org.toLowerCase();
    if (!matches['_all']) {
      matches['_all'] = [keyword];
    }
    else {
      matches['_all'][0] += ' ' + keyword
    }

    if (isInteger(keyword)) {
      const num = parseInt(keyword, 10);
      if (!matches['_number']) {
        matches['_number'] = [];
      }
      matches['_number'].push(num);
      continue;
    }

    keyword = keyword.replace(/&gt;/g, '>');
    keyword = keyword.replace(/&lt;/g, '<');
    keyword = keyword.replace(/＞/g, '>');
    keyword = keyword.replace(/＜/g, '<');

    const lvNumber = extractLvNumber(keyword);
    if (lvNumber !== null) {
      if (!matches['songLevels']) {
        matches['songLevels'] = [];
      }
      matches['songLevels'].push(lvNumber);
      continue;
    }
    const noteNumber = extractNoteNumber(keyword);
    if (noteNumber !== null) {
      if (!matches['notes']) {
        matches['notes'] = [];
      }
      matches['notes'].push(noteNumber);
      continue;
    }
    const skillNumber = extractSkillNumber(keyword);
    if (skillNumber !== null) {
      if (!matches['scoreUpMaxValue']) {
        matches['scoreUpMaxValue'] = [];
      }
      matches['scoreUpMaxValue'].push(skillNumber);
      continue;
    }

    if (isValidRelationStr(keyword)) {
      if (!matches['_relationStr']) {
        matches['_relationStr'] = [];
      }
      matches['_relationStr'].push(keyword);
      continue;
    }

    for (const type in config) {
      const typeConfig = config[type];
      for (const key in typeConfig) {
        const values = typeConfig[key];
        for (const value of values) {
          if (typeof value === 'string') {
            if (value === keyword) {
              if (!matches[type]) {
                matches[type] = [];
              }
              const numKey = isInteger(key) ? parseInt(key, 10) : key;
              matches[type].push(numKey);
              matched = true;
              continue;
            }
          }

          if (Array.isArray(value)) {
            if (value.includes(keyword)) {
              if (!matches[type]) {
                matches[type] = [];
              }
              const numKey = isInteger(key) ? parseInt(key, 10) : key;
              matches[type].push(numKey);
              matched = true;
              continue;
            }
          }

          if (typeof value === 'object') {
            if (Object.keys(value).includes(keyword)) {
              if (!matches[type]) {
                matches[type] = [];
              }
              const numKey = isInteger(key) ? parseInt(key, 10) : key;
              matches[type].push(numKey);
              matched = true;
              continue;
            }
          }
        }
      }
    }

  }

  return matches;
}

function isValidRelationStr(_relationStr: string): boolean {
  const lessThanPattern = /^<\d+$/;
  const greaterThanPattern = /^>\d+$/;
  const rangePattern = /^\d+-\d+$/;

  return lessThanPattern.test(_relationStr) ||
    greaterThanPattern.test(_relationStr) ||
    rangePattern.test(_relationStr);
}
export function include(source: string, target: string) {
  source = source.toLowerCase()
  return source.includes(target) && (!/^[A-Za-z0-9]+$/.test(target) || target.length > 3) || source.split(' ').includes(target) && (!/^[A-Za-z0-9]+$/.test(target) || target.length > 1) || source == target
}
export function match(matches: FuzzySearchResult, target: any, numberTypeKey: string[]): boolean {
  if (!target) {
    return false;
  }
  let match;

  for (var key in matches) {
    if (key === '_number' || key === '_all') {
      continue;
    }
    if (match == undefined) match = true
    if (key === '_relationStr') continue

    // 匹配关键词
    if (target[key] !== undefined) {
      // 处理 Array 类型
      if (Array.isArray(target[key]) || typeof target[key] === 'object') {
        let matchArray = false;
        for (let i in target[key]) {
          const element = target[key][i];

          // 对比字符串（忽略大小写）
          if (
            typeof element === 'string' &&
            matches[key].some((m: any) => typeof m === 'string' && m.toLowerCase() === element.toLowerCase())
          ) {
            matchArray = true;
            break;
          }

          // 对比数字（songLevels 等）
          if (
            typeof element === 'number' &&
            matches[key].some((m: any) => typeof m === 'number' && m === element)
          ) {
            matchArray = true;
            break;
          }
        }
        if (matchArray) {
          match = true;
          continue;
        } else {
          match = false;
          break;
        }
      }
      // 处理 Object (string, number) 类型
      else {
        if (
          typeof target[key] === 'string' &&
          matches[key].some((m: any) => typeof m === 'string' && m.toLowerCase() === target[key].toLowerCase())
        ) {
          match = true;
          continue;
        }

        if (
          typeof target[key] === 'number' &&
          matches[key].some((m: any) => typeof m === 'number' && m === target[key])
        ) {
          match = true;
          continue;
        }

        match = false;
        break;
      }
    }
  }
  if (match == undefined) match = false
    // 处理指定的数字类型 key，比如 songLevels
  if (!match && numberTypeKey.length > 0 && matches['_number'] !== undefined) {
    for (let key of numberTypeKey) {
      if (matches['_number'].includes(target[key])) {
        match = true;
        break
      }
    }
  }

  //如果在config中所有类型都不符合的情况下，检查 _all
  if (!match && matches['_all']) {
    for (let i = 0; i < matches['_all'].length; i++) {
      let matchValue = (matches['_all'][i] as string).toLowerCase();
      for (let key in target) {
        if (key != 'musicTitle' && key != 'nickname' && key != 'prefix' && !key.endsWith('Name'))
          continue
        if (typeof target[key] === 'string') {
          if (key == 'nickname') {
            let nicknames = target[key].split(',')
            for (let nickname of nicknames) {
              if (include(nickname, matchValue)) {
                match = true;
                break;
              }
            }
          }
          if (match) break
          if (include(target[key], matchValue)) {
            match = true;
            break;
          }
        }
        if (Array.isArray(target[key])) {
          for (let j = 0; j < target[key].length; j++) {
            if (typeof target[key][j] === 'string') {
              //@ts-ignore
              if (include(target[key][j], matchValue)) {
                match = true;
                break;
              }
            }
          }
        }
        if (match) break;
      }
    }
  }

  return match;
}




// 以下为数字与范围函数
export function checkRelationList(num: number, _relationStrList: string[]): boolean {
  function checkRelation(num: number, _relationStr: string): boolean {
    const lessThanMatch = _relationStr.match(/^<(\d+)$/);
    const greaterThanMatch = _relationStr.match(/^>(\d+)$/);
    const rangeMatch = _relationStr.match(/^(\d+)-(\d+)$/);

    if (lessThanMatch) {
      const boundary = parseFloat(lessThanMatch[1]);
      return num < boundary;
    }

    if (greaterThanMatch) {
      const boundary = parseFloat(greaterThanMatch[1]);
      return num > boundary;
    }

    if (rangeMatch) {
      const lowerBoundary = parseFloat(rangeMatch[1]);
      const upperBoundary = parseFloat(rangeMatch[2]);
      return num >= lowerBoundary && num <= upperBoundary;
    }

    throw new Error('Invalid relation string format');
  }

  for (let i = 0; i < _relationStrList.length; i++) {
    try {
      if (checkRelation(num, _relationStrList[i])) {
        return true;
      }
    } catch (e) {
      logger('fuzzySearch', "Invalid relation string format");
    }
  }
  return false;
}

