import { injectable } from "tsyringe"; // Gunakan jika kamu pakai tsyringe, hapus jika tidak

@injectable()
export class CounterService {
  /**
   * Fungsi ini dijamin aman dari Race Condition berkat fitur atomic increment Prisma.
   *
   * @param tx Transaksi Prisma agar sejalan dengan proses simpan data utama
   * @param type Jenis dokumen (Contoh: "SO", "RN", "CLIENT")
   * @param period Periode dokumen (Contoh: "2607" untuk Juli 2026, atau "ALL")
   * @param padding Jumlah digit nomor urut (Contoh: 5 untuk XXXXX)
   * @returns Nomor urut yang sudah di-format string (Contoh: "00001")
   */
  async getNextFormattedNumber(
    tx: any, // Menggunakan instance transaksi Prisma (tx)
    type: string,
    period: string,
    padding: number,
  ): Promise<string> {
    // Upsert: Jika data belum ada, buat (create) mulai dari 1.
    // Jika sudah ada, langsung tambahkan 1 (increment) pada lastValue.
    const counter = await tx.autoCounter.upsert({
      where: {
        type_period: {
          type: type,
          period: period,
        },
      },
      update: {
        lastValue: { increment: 1 },
      },
      create: {
        type: type,
        period: period,
        lastValue: 1,
      },
    });

    // Mengubah angka menjadi string dengan nol di depan (contoh: 1 -> "00001")
    return String(counter.lastValue).padStart(padding, "0");
  }

  /**
   * Mendapatkan tahun dan bulan saat ini dengan format YYMM (Contoh: "2607")
   */
  getCurrentPeriodYYMM(): string {
    const date = new Date();
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${yy}${mm}`;
  }
}
