"use client";
import {useLanguage} from "@/components/providers/language-provider";
/** The ERP is English-only, independent of public site language preference. */
export function useErpLanguage(){
 const source=useLanguage();
 return {...source, locale:"en" as "en" | "bn"};
}
