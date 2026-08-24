export function Card({children,className='' }:{children:React.ReactNode;className?:string}){return <div className={`rounded-xl border bg-white shadow-sm ${className}`}>{children}</div>}
export function CardHeader({children}:{children:React.ReactNode}){return <div className="border-b p-4">{children}</div>}
export function CardContent({children}:{children:React.ReactNode}){return <div className="p-4">{children}</div>}
