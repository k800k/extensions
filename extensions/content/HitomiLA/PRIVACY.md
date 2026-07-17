# Privacy assessment for HitomiLA

The extension sends byte ranges, gallery identifiers, search terms, selected language names, and ordinary HTTP metadata to the four exact declared hosts through MangaReader's brokered client. It requests only public resources and does not support accounts, cookies, authentication, favorites, or user submissions.

Search terms can reveal reading interests to the remote service and normal network intermediaries. The extension adds no analytics endpoint, persistent identifier, or cross-service request. MangaReader and Hitomi.la may retain network logs under their own policies; removing the package stops future extension-originated requests.
