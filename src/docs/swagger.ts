export const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Goenakan.id WhatsApp CRM & ERP Integration API",
    version: "1.0.0",
    description: `
Dokumentasi Endpoint & Webhook Integrasi WhatsApp CRM & ERP Goenakan.id (Tahap 3).
Sistem ini menyediakan pipeline pengiriman notifikasi otomatis untuk tahapan proses bisnis ERP (Invoice, Pembayaran, SOP Produksi, Pengiriman Resi) serta manajemen Leads CRM WhatsApp.

### Fitur Utama:
1. **Unified Notification Endpoint**: \`POST /crm/notifications/send\` untuk semua kebutuhan pengiriman pesan.
2. **Template Pengaturan CRM Dinamis**: Memanfaatkan template di database (\`/notif-invoice\`, dsb.) dengan variabel \`{{nama}}\`, \`{{nomor_invoice}}\`, dsb.
3. **Lampiran Dokumen/Media**: Kirim file PDF invoice atau gambar mockup langsung ke WhatsApp pelanggan.
4. **Dual Authentication**: Mendukung Bearer JWT (NextAuth) dan header \`x-api-key\` untuk pemanggilan server-to-server.
    `,
    contact: {
      name: "Goenakan.id Engineering Team",
      url: "https://goenakan.id",
    },
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Development Local Server",
    },
    {
      url: "https://api.goenakan.id",
      description: "Production Server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Token otentikasi NextAuth Session untuk dashboard admin.",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Internal Service API Key untuk integrasi backend ERP antar-modul (Default: 'goenakan-internal-erp-2026').",
      },
    },
    schemas: {
      SendNotificationRequest: {
        type: "object",
        required: ["phoneNumber"],
        properties: {
          phoneNumber: {
            type: "string",
            example: "081234567890",
            description: "Nomor WhatsApp tujuan (format 08..., 628..., atau +628...)",
          },
          template: {
            type: "string",
            example: "/notif-invoice",
            description: "Shortcut, Judul, atau UUID template dari Pengaturan CRM (contoh: '/notif-invoice', '/notif-bayar', '/notif-produksi', '/notif-resi')",
          },
          variables: {
            type: "object",
            description: "Key-value pairs untuk menggantikan placeholder {{variabel}} dalam template",
            example: {
              nama: "PT Maju Bersama",
              nomor_invoice: "INV_0105_MB_XI_2026",
              total: "Rp 15.000.000",
              jatuh_tempo: "25 Nov 2026",
              link: "https://goenakan.id/invoice/INV_0105",
            },
          },
          message: {
            type: "string",
            example: "Halo Kak, invoice INV_0105 sudah diterbitkan. Terima kasih!",
            description: "Teks pesan bebas langsung (digunakan jika tidak menggunakan template CRM)",
          },
          mediaUrl: {
            type: "string",
            example: "https://api.goenakan.id/uploads/invoices/INV_0105.pdf",
            description: "URL file publik (PDF atau Foto) untuk dikirimkan sebagai lampiran WhatsApp",
          },
          fileName: {
            type: "string",
            example: "Invoice_INV_0105.pdf",
            description: "Nama file saat diterima di WhatsApp klien",
          },
          mediaCaption: {
            type: "string",
            example: "Berikut lampiran dokumen tagihan resmi Anda.",
            description: "Keterangan caption khusus jika berbeda dari renderedMessage",
          },
          category: {
            type: "string",
            enum: ["INVOICE", "PAYMENT", "PRODUCTION", "SHIPPING", "GENERAL"],
            example: "INVOICE",
            description: "Kategori proses bisnis untuk audit log",
          },
          referenceId: {
            type: "string",
            example: "INV_0105",
            description: "ID atau Nomor referensi proses ERP terkait",
          },
          orderId: {
            type: "string",
            example: "ord_cm3...",
            description: "UUID Order jika ingin ditautkan langsung ke relasi database Order",
          },
        },
      },
      SendNotificationResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Notifikasi WhatsApp berhasil dikirim" },
          data: {
            type: "object",
            properties: {
              success: { type: "boolean", example: true },
              messageId: { type: "string", example: "clx90a..." },
              recipient: { type: "string", example: "6281234567890" },
              category: { type: "string", example: "INVOICE" },
              referenceId: { type: "string", example: "INV_0105" },
              renderedMessage: { type: "string", example: "Halo Kak PT Maju Bersama, Invoice INV_0105 telah diterbitkan..." },
              hasMedia: { type: "boolean", example: true },
              sentAt: { type: "string", format: "date-time" },
              status: { type: "string", example: "sent" },
            },
          },
        },
      },
      CrmLead: {
        type: "object",
        properties: {
          id: { type: "string", example: "c56a-..." },
          phoneNumber: { type: "string", example: "6287870634368" },
          displayName: { type: "string", example: "segara" },
          waPushName: { type: "string", example: "Segara Konveksi" },
          status: { type: "string", example: "NEW" },
          assignedToUserId: { type: "string", nullable: true },
          trafficSource: { type: "string", example: "website" },
          lastMessage: { type: "string", nullable: true },
          lastMessageAt: { type: "string", format: "date-time", nullable: true },
          unreadCount: { type: "integer", example: 0 },
        },
      },
      ApiResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Operasi berhasil" },
          data: { type: "object" },
        },
      },
    },
  },
  security: [
    { bearerAuth: [] },
    { apiKeyAuth: [] },
  ],
  paths: {
    "/crm/notifications/send": {
      post: {
        tags: ["ERP & System WhatsApp Notifications"],
        summary: "Kirim Notifikasi WhatsApp Terpadu (Template CRM / Raw Text + Media Attachment)",
        description: `
Endpoint serbaguna untuk seluruh modul ERP:
- **Invoice**: Kirim rincian invoice & link pembayaran dengan template \`/notif-invoice\` atau lampiran PDF.
- **Pembayaran**: Konfirmasi tanda terima pembayaran lunas dengan template \`/notif-bayar\`.
- **Produksi**: Update tahapan SOP (Sablon/Bordir/QC) dengan template \`/notif-produksi\`.
- **Pengiriman**: Kirim nomor resi kurir logistik dengan template \`/notif-resi\`.
        `,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SendNotificationRequest",
              },
            },
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "File dokumen PDF atau gambar yang diunggah langsung",
                  },
                  phoneNumber: { type: "string", example: "081234567890" },
                  template: { type: "string", example: "/notif-invoice" },
                  variables: {
                    type: "string",
                    description: "JSON stringified object variabel (misal: '{\"nama\":\"PT Maju\",\"nomor_invoice\":\"INV_0105\"}')",
                  },
                  message: { type: "string" },
                  category: { type: "string", example: "INVOICE" },
                  referenceId: { type: "string", example: "INV_0105" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Pesan WhatsApp berhasil dikirim dan dicatat di database",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SendNotificationResponse",
                },
              },
            },
          },
          400: {
            description: "Parameter tidak lengkap atau nomor telepon tidak valid",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiResponse",
                },
              },
            },
          },
          401: {
            description: "Unauthorized (Token atau x-api-key tidak valid)",
          },
          404: {
            description: "Template pesan tidak ditemukan di Pengaturan CRM",
          },
        },
      },
    },

    "/crm/leads": {
      get: {
        tags: ["WhatsApp CRM - Leads"],
        summary: "Daftar Leads WhatsApp CRM",
        description: "Mengambil daftar leads dengan filter status, penugasan CS ('me', 'unassigned', atau ID), pencarian, dan sumber trafik.",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" }, description: "Filter status lead (NEW, CONTACTED, DEAL, dll)" },
          { name: "assignedTo", in: "query", schema: { type: "string" }, description: "'me', 'unassigned', atau userId spesifik" },
          { name: "trafficSource", in: "query", schema: { type: "string" }, description: "'all' | 'website' | 'master_code' | 'direct'" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Cari nama, nomor HP, atau isi chat" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          200: {
            description: "Daftar leads berhasil dimuat",
          },
        },
      },
    },

    "/crm/leads/{id}": {
      get: {
        tags: ["WhatsApp CRM - Leads"],
        summary: "Detail Lead by ID",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Detail lead ditemukan" },
          404: { description: "Lead tidak ditemukan" },
        },
      },
    },

    "/crm/leads/{id}/claim": {
      post: {
        tags: ["WhatsApp CRM - Leads"],
        summary: "Klaim Lead (Chat Lock Anti-Tabrakan CS)",
        description: "Mengunci percakapan ke CS yang sedang login sehingga CS lain tidak dapat membalas chat ini secara bersamaan.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Lead berhasil diklaim dan dikunci" },
          409: { description: "Lead sudah diklaim oleh CS lain" },
        },
      },
    },

    "/crm/leads/{id}/takeover": {
      post: {
        tags: ["WhatsApp CRM - Leads"],
        summary: "Ambil Alih Lead Terkunci (Takeover)",
        description: "Memindahkan kepemilikan lead yang sedang dikunci CS lain. Memerlukan PIN Supervisor jika CS tidak berwenang.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  supervisorPin: { type: "string", example: "123456" },
                  reason: { type: "string", example: "CS bertugas sedang cuti sakit" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Lead berhasil diambil alih" },
          403: { description: "PIN Supervisor salah atau otorisasi ditolak" },
        },
      },
    },

    "/crm/leads/verify-supervisor-pin": {
      post: {
        tags: ["WhatsApp CRM - Leads"],
        summary: "Verifikasi PIN Supervisor",
        description: "Memeriksa kevalidan PIN Supervisor untuk fitur proteksi antrean dan chat lock.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pin"],
                properties: {
                  pin: { type: "string", example: "123456" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "PIN valid" },
          401: { description: "PIN salah" },
        },
      },
    },

    "/crm/leads/{id}/attach-code": {
      post: {
        tags: ["WhatsApp CRM - Leads"],
        summary: "Pasang Kode Promosi / Tracking ke Lead",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code"],
                properties: {
                  code: { type: "string", example: "GK-001" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Kode berhasil dipasangkan" },
        },
      },
    },

    "/crm/leads/{id}/link-customer": {
      post: {
        tags: ["WhatsApp CRM - Leads"],
        summary: "Hubungkan Lead dengan Akun Customer Web",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["customerProfileId"],
                properties: {
                  customerProfileId: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Lead terhubung dengan customer" },
        },
      },
    },

    "/crm/leads/sync-from-wa": {
      post: {
        tags: ["WhatsApp CRM - Leads"],
        summary: "Sinkronisasi Chat WhatsApp Masuk",
        description: "Menarik pesan chat terbaru dari gateway WhatsApp dan mengklasifikasikan lead secara otomatis.",
        responses: {
          200: { description: "Sinkronisasi berhasil dijalankan" },
        },
      },
    },

    "/crm/leads/webhook": {
      post: {
        tags: ["WhatsApp CRM - Webhook"],
        summary: "Inbound Webhook Penerima Pesan WhatsApp",
        description: "Webhook callback yang dipanggil oleh gateway WA (Waha/Catha) saat ada pesan masuk baru.",
        responses: {
          200: { description: "Webhook diterima dan diproses" },
        },
      },
    },

    "/crm/templates": {
      get: {
        tags: ["WhatsApp CRM - Templates"],
        summary: "Daftar Template Pesan Cepat (Quick Reply & ERP Notifications)",
        description: "Mengambil semua template pesan balasan cepat beserta template notifikasi ERP.",
        responses: {
          200: { description: "Daftar template berhasil diambil" },
        },
      },
      post: {
        tags: ["WhatsApp CRM - Templates"],
        summary: "Buat Template Pesan Baru",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "content"],
                properties: {
                  title: { type: "string", example: "Notifikasi Invoice Baru" },
                  content: { type: "string", example: "Halo Kak {{nama}}, invoice {{nomor_invoice}} telah terbit." },
                  category: { type: "string", example: "ERP / Invoice" },
                  shortcut: { type: "string", example: "/notif-invoice" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Template berhasil dibuat" },
        },
      },
    },

    "/crm/templates/categories": {
      get: {
        tags: ["WhatsApp CRM - Templates"],
        summary: "Daftar Kategori Template",
        responses: {
          200: { description: "Daftar kategori berhasil diambil" },
        },
      },
    },

    "/crm/custom-codes": {
      get: {
        tags: ["WhatsApp CRM - Custom Codes"],
        summary: "Daftar Kode Custom Promosi / Attribution (GK-XXX)",
        responses: {
          200: { description: "Daftar kode berhasil diambil" },
        },
      },
      post: {
        tags: ["WhatsApp CRM - Custom Codes"],
        summary: "Buat Kode Tracking Custom Baru",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code", "label", "type"],
                properties: {
                  code: { type: "string", example: "GK-010" },
                  label: { type: "string", example: "Instagram Ads Sablon Nov" },
                  type: { type: "string", enum: ["PROMOTION", "CHANNEL", "CAMPAIGN", "OTHER"] },
                  assignedUserId: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Kode berhasil dibuat" },
        },
      },
    },

    "/crm/statuses": {
      get: {
        tags: ["WhatsApp CRM - Statuses & Labels"],
        summary: "Daftar Status Pipeline Lead (Kanban Columns)",
        responses: {
          200: { description: "Daftar status berhasil diambil" },
        },
      },
    },

    "/crm/labels": {
      get: {
        tags: ["WhatsApp CRM - Statuses & Labels"],
        summary: "Daftar Label / Tag Klasifikasi Leads",
        responses: {
          200: { description: "Daftar label berhasil diambil" },
        },
      },
    },

    "/crm/settings": {
      get: {
        tags: ["WhatsApp CRM - Settings"],
        summary: "Ambil Pengaturan Umum CRM",
        description: "Membaca konfigurasi bot, anti-collision chat lock, dan supervisor PIN.",
        responses: {
          200: { description: "Pengaturan CRM berhasil diambil" },
        },
      },
      patch: {
        tags: ["WhatsApp CRM - Settings"],
        summary: "Update Pengaturan Umum CRM",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  enableAntiCollision: { type: "boolean" },
                  supervisorPin: { type: "string" },
                  botEnabled: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Pengaturan berhasil diperbarui" },
        },
      },
    },
  },
};
