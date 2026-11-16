export interface LeadResolutionInput {
  phoneNumber: string;
  displayName?: string | null;
  waPushName?: string | null;
  customerProfile?: {
    accountType?: "INDIVIDUAL" | "CORPORATE" | string;
    companyName?: string | null;
    picName?: string | null;
    user?: {
      name?: string | null;
    } | null;
  } | null;
}

export interface ResolvedContactName {
  name: string;
  source: "DISPLAY_NAME" | "CUSTOMER_PROFILE" | "WA_PUSH_NAME" | "PHONE_NUMBER";
  formattedPhone: string;
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("62") && cleaned.length >= 10) {
    const prefix = "+62";
    const part1 = cleaned.slice(2, 5);
    const part2 = cleaned.slice(5, 9);
    const part3 = cleaned.slice(9);
    return part3 ? `${prefix} ${part1}-${part2}-${part3}` : `${prefix} ${part1}-${part2}`;
  }
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

export function resolveLeadContactName(input: LeadResolutionInput): ResolvedContactName {
  const formattedPhone = formatPhoneNumber(input.phoneNumber);

  // 1. Display Name yang disimpan oleh CS
  if (input.displayName && input.displayName.trim().length > 0) {
    return {
      name: input.displayName.trim(),
      source: "DISPLAY_NAME",
      formattedPhone,
    };
  }

  // 2. Data Pelanggan di ERP (Customer Profile)
  if (input.customerProfile) {
    if (input.customerProfile.accountType === "CORPORATE" && input.customerProfile.companyName) {
      const company = input.customerProfile.companyName.trim();
      const pic = input.customerProfile.picName?.trim();
      return {
        name: pic ? `${company} (PIC: ${pic})` : company,
        source: "CUSTOMER_PROFILE",
        formattedPhone,
      };
    }

    if (input.customerProfile.user?.name && input.customerProfile.user.name.trim().length > 0) {
      return {
        name: input.customerProfile.user.name.trim(),
        source: "CUSTOMER_PROFILE",
        formattedPhone,
      };
    }
  }

  // 3. Nama dari profil WhatsApp (pushName)
  if (input.waPushName && input.waPushName.trim().length > 0) {
    return {
      name: input.waPushName.trim(),
      source: "WA_PUSH_NAME",
      formattedPhone,
    };
  }

  // 4. Fallback ke format nomor internasional
  return {
    name: formattedPhone,
    source: "PHONE_NUMBER",
    formattedPhone,
  };
}
