import { request } from './http'
export type ReviewItem = {id:string;source:'personal'|'collab';source_id:string;context_id:string;kind:string;title:string;reason:string;proposal:string;impact:string;status:'pending'|'approved'|'rejected'|'superseded';decision?:string;edited_content?:string;comment?:string;execution_status:string;execution_error?:string;created_at:string;decided_at?:string}
export type ReviewList = {data:ReviewItem[];has_more:boolean;counts:{pending:number;done:number}}
export const listReviews=(status='pending',source='all',q='',offset=0)=>request<ReviewList>({method:'GET',path:'/reviews',query:{status,source,q,offset}},()=>({data:[],has_more:false,counts:{pending:0,done:0}}))
export const decideReview=(id:string,decision:string,comment:string,content:string)=>request<ReviewItem>({method:'POST',path:`/reviews/${id}/decision`,body:{decision,comment,content}},()=>{throw Error('审核需要连接服务端')})
