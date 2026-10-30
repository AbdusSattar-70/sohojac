/** The academy's civil day, independent of Worker/browser UTC timezone. */
export function businessDate(date:Date=new Date()):string{
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit",
  }).format(date);
}
