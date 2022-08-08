// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import classNames from 'classnames';
import { debounce, get, noop, } from 'lodash';
import { Manager, Reference } from 'react-popper';
import type { LocalizerType } from '../../types/Util';
import type { Theme } from '../../util/theme';
import * as KeyboardLayout from '../../services/keyboardLayout';
import { useRefMerger } from '../../hooks/useRefMerger';
import { Modal } from '../Modal';
import { AttachmentDraftType, InMemoryAttachmentDraftType } from '../../types/Attachment';
import { IMAGE_GIF } from '../../types/MIME';

const apiKey = process.env.GIPHY_API_KEY || "PrX9cDCZwBMq2bi1hYKd79r1h44fSCnk";

const apiURL = (query: string) => {
  return 'https://api.giphy.com/v1/gifs/search?q=' + query + '&api_key=' + apiKey + '&rating=pg'
}

export type OwnProps = {
  readonly className?: string;
  readonly i18n: LocalizerType;
  readonly position?: 'top-end' | 'top-start';
  readonly theme?: Theme;
  readonly conversationId: string;
  addAttachment: (
    conversationId: string,
    attachment: InMemoryAttachmentDraftType
  ) => unknown;
};

export type Props = OwnProps;

function useIsMounted() {
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  return () => isMountedRef.current;
}

function useDebounce(cb, delay) {
  const options = {
    leading: false,
    trailing: true
  };
  const inputsRef = React.useRef({cb, delay});

  const isMounted = useIsMounted();
  React.useEffect(() => { inputsRef.current = { cb, delay }; });
  return React.useCallback(
    debounce((...args) => {
        if (inputsRef.current.delay === delay && isMounted())
          inputsRef.current.cb(...args);
      }, delay, options
    ),
    [delay, debounce]
  );
}

export const GiphyButton = React.memo(
  ({
    className,
    i18n,
    conversationId,
    addAttachment
  }: Props) => {
    const [open, setOpen] = React.useState(false);
    const [popperRoot, setPopperRoot] = React.useState<HTMLElement | null>(
      null
    );
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    const refMerger = useRefMerger();
    const [gifs, setGifs] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [searchString, setSearchString] = React.useState("dogs");

    const getGifs = useDebounce(
      () => {
        setIsLoading(true);
        fetch(apiURL(searchString)).then((response) => {
          return response.json()
        }).then(function(json) {
          Promise.all(json.data.map(async (item) => {
            const data = await fetch(item.images.preview_gif.url);
            const blob = await data.blob();
            var urlCreator = window.URL || window.webkitURL;
            var imageUrl = urlCreator.createObjectURL(blob);
            return {
              ...item,
              blob: imageUrl
            }
          })).then(data => {
            setGifs(data);
            setIsLoading(false);
          });
        }).catch(function(ex) {
          console.warn('ERROR: ', ex)
        })
      },
      1000
    );

    React.useEffect(() => {
      if (open) {
        // Function to get gifs
        getGifs()
        
      }
    }, [searchString, open])

    const handleClickButton = React.useCallback(() => {
      if (popperRoot) {
        setOpen(false);
      } else {
        setOpen(true);
      }
    }, [
      popperRoot,
      setOpen,
    ]);

    const handlePickGif = React.useCallback(
      async (data) => {
        setOpen(false);
        console.log(data)
        const newData = await fetch(data.images.original.url);
        const blob = await newData.blob();
        
        const buffer = await blob.arrayBuffer()
        const uint = new Uint8Array(buffer);

        const newAttachment = {
          url: data.images.original.url,
          pending: false,
          screenshotData: uint,
          contentType: IMAGE_GIF,
          data: uint,
          size: data.images.original.size,
        };
        addAttachment(conversationId, newAttachment)
        console.log(addAttachment)
      },
      [setOpen]
    );

    const onClose = React.useCallback(() => {
      setOpen(false);
    }, [setOpen]);

    // Create popper root and handle outside clicks
    React.useEffect(() => {
      if (open) {
        const root = document.createElement('div');
        setPopperRoot(root);
        document.body.appendChild(root);
        const handleOutsideClick = ({ target }: MouseEvent) => {
          const targetElement = target as HTMLElement;
          const targetClassName = targetElement
            ? targetElement.className || ''
            : '';

          // We need to special-case sticker picker header buttons, because they can
          //   disappear after being clicked, which breaks the .contains() check below.
          const isMissingButtonClass =
            !targetClassName ||
            targetClassName.indexOf('module-sticker-picker__header__button') <
              0;

          if (
            !root.contains(targetElement) &&
            isMissingButtonClass &&
            targetElement !== buttonRef.current
          ) {
            setOpen(false);
          }
        };
        document.addEventListener('click', handleOutsideClick);

        return () => {
          document.body.removeChild(root);
          document.removeEventListener('click', handleOutsideClick);
          setPopperRoot(null);
        };
      }

      return noop;
    }, [open, setOpen, setPopperRoot]);

    // Install keyboard shortcut to open sticker picker
    React.useEffect(() => {
      const handleKeydown = (event: KeyboardEvent) => {
        const { ctrlKey, metaKey, shiftKey } = event;
        const commandKey = get(window, 'platform') === 'darwin' && metaKey;
        const controlKey = get(window, 'platform') !== 'darwin' && ctrlKey;
        const commandOrCtrl = commandKey || controlKey;
        const key = KeyboardLayout.lookup(event);

        // We don't want to open up if the conversation has any panels open
        const panels = document.querySelectorAll('.conversation .panel');
        if (panels && panels.length > 1) {
          return;
        }

        if (commandOrCtrl && shiftKey && (key === 's' || key === 'S')) {
          event.stopPropagation();
          event.preventDefault();

          setOpen(!open);
        }
      };
      document.addEventListener('keydown', handleKeydown);

      return () => {
        document.removeEventListener('keydown', handleKeydown);
      };
    }, [open, setOpen]);


    return (
      <Manager>
        <Reference>
          {({ ref }) => (
            <button
              type="button"
              ref={refMerger(buttonRef, ref)}
              onClick={handleClickButton}
              className={classNames(
                {
                  'module-sticker-button__button': true,
                  'module-sticker-button__button--active': open,
                },
                className
              )}
              aria-label={i18n('stickers--StickerPicker--Open')}
            />
          )}
        </Reference>
        {open
          ? (
            <Modal hasXButton i18n={i18n} onClose={onClose}>
                <div className="giphy__wrapper">
                  <input type='text' value={searchString} onChange={(e) => setSearchString(e.target.value)}/>
                    { !isLoading ? 
                      <div style={{display: 'flex', flexWrap: 'wrap'}}>
                        {
                          gifs.map((item) => (
                            <div className='gif__container'>
                              <img className='gif' src={item?.blob} onClick={() => handlePickGif(item)}/>      
                            </div>
                          ))
                        }
                      </div>
                      : <p>LOAD</p>
                    }
                </div>

            </Modal>
          ) : null}
      </Manager>
    );
  }
);
