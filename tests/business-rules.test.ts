import {describe,it,expect} from 'vitest';
function validate(input:number,output:number,rejection:number,available:number){if(input<0||output<0||rejection<0)throw new Error('negative');if(rejection>input)throw new Error('rejection');if(input>available)throw new Error('wip');return true}
describe('quantity rules',()=>{it('accepts valid production',()=>expect(validate(100,90,10,100)).toBe(true));it('rejects excessive rejection',()=>expect(()=>validate(100,90,101,100)).toThrow());it('rejects insufficient WIP',()=>expect(()=>validate(101,90,1,100)).toThrow());});
