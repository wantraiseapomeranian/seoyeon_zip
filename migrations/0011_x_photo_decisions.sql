CREATE TABLE x_photo_differences(left_url TEXT NOT NULL,right_url TEXT NOT NULL,PRIMARY KEY(left_url,right_url),CHECK(left_url<right_url));
